import {
  deleteObject,
  getBlob,
  getMetadata,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from './firebase';
import {
  deleteOfflineAttachmentBlob,
  getOfflineAttachmentEntry,
  saveOfflineAttachmentBlob,
  updateOfflineAttachmentStatus,
} from './offlineQueue';
import { isQuotaExceededError } from './db/localDb';
import { VaultAttachment } from './types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MiB

export const ALLOWED_ATTACHMENT_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentMime = (typeof ALLOWED_ATTACHMENT_MIMES)[number];

const inFlightUploads = new Map<string, Promise<VaultAttachment>>();

/**
 * Generates a collision-resistant attachment ID compatible with IndexedDB, Firestore, and Storage paths.
 */
export function generateAttachmentId(prefix = 'att'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${Date.now()}_${uuid.slice(0, 16)}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Sanitizes a user filename to prevent path traversal, control characters, and unsupported extensions.
 */
export function sanitizeStorageFilename(rawName: string, mimeType?: string): string {
  const base =
    (rawName || 'attachment')
      .replace(/\\/g, '/')
      .split('/')
      .pop() || 'attachment';

  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^[_.-]+/, '')
    .slice(0, 96);

  const extMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };

  const expectedExt = mimeType ? extMap[mimeType] : undefined;
  if (!cleaned) {
    return `study_file${expectedExt || '.png'}`;
  }
  if (
    expectedExt &&
    !cleaned.toLowerCase().endsWith(expectedExt) &&
    !(mimeType === 'image/jpeg' && cleaned.toLowerCase().endsWith('.jpeg'))
  ) {
    return `${cleaned.slice(0, 88)}${expectedExt}`;
  }
  return cleaned;
}

/**
 * Builds the canonical authenticated, user-scoped Firebase Storage path:
 * `users/{uid}/study-attachments/{attachmentId}/{safeFilename}`
 */
export function buildStudyAttachmentPath(
  uid: string,
  attachmentId: string,
  fileName: string,
  mimeType?: string
): string {
  if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
    throw new Error('Invalid owner UID for storage path.');
  }
  if (!attachmentId || !/^[a-zA-Z0-9_-]+$/.test(attachmentId)) {
    throw new Error('Invalid attachment ID for storage path.');
  }
  const safeFile = sanitizeStorageFilename(fileName, mimeType);
  return `users/${uid}/study-attachments/${attachmentId}/${safeFile}`;
}

/**
 * Magic-byte content sniffing: validates actual binary header bytes of a file/Blob,
 * not only the browser's declared MIME type.
 */
export async function validateFileMagicBytes(
  blob: Blob,
  declaredMime?: string
): Promise<{ valid: boolean; detectedMime: AllowedAttachmentMime | null; reason?: string }> {
  if (!blob || blob.size <= 0) {
    return { valid: false, detectedMime: null, reason: 'File is empty (0 bytes).' };
  }
  if (blob.size > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      detectedMime: null,
      reason: `File size (${(blob.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 10 MB maximum limit.`,
    };
  }

  const headerSlice = blob.slice(0, 12);
  const buf = await headerSlice.arrayBuffer();
  const bytes = new Uint8Array(buf);

  let detectedMime: AllowedAttachmentMime | null = null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    detectedMime = 'image/png';
  }
  // JPEG: FF D8 FF
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detectedMime = 'image/jpeg';
  }
  // WEBP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  else if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    detectedMime = 'image/webp';
  }
  // PDF: 25 50 44 46 2D (%PDF-)
  else if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    detectedMime = 'application/pdf';
  }

  if (!detectedMime) {
    return {
      valid: false,
      detectedMime: null,
      reason:
        'Unsupported or corrupted file header. Only genuine PNG, JPEG, WebP images and PDF documents are allowed.',
    };
  }

  if (
    declaredMime &&
    declaredMime !== '' &&
    declaredMime !== detectedMime &&
    !(declaredMime === 'image/jpg' && detectedMime === 'image/jpeg')
  ) {
    return {
      valid: false,
      detectedMime,
      reason: `Declared MIME type (${declaredMime}) does not match actual file signature (${detectedMime}).`,
    };
  }

  return { valid: true, detectedMime };
}

/**
 * Computes SHA-256 hex checksum of a Blob/File for integrity verification and deduplication.
 */
export async function computeBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const bytes = new Uint8Array(buffer);
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}_${blob.size}`;
}

/**
 * Converts a legacy `data:...;base64,...` URL into a binary Blob.
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL format.');
  }
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) {
    throw new Error('Malformed data URL: missing comma separator.');
  }
  const header = dataUrl.slice(5, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.split(';')[0];
  const mimeType = mimeMatch || 'image/png';

  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

/**
 * Converts a Blob into a temporary base64 data URL strictly for transient Gemini OCR requests.
 */
export function blobToTemporaryDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob.'));
      reader.readAsDataURL(blob);
      return;
    }
    blob
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        resolve(`data:${blob.type || 'image/png'};base64,${btoa(binary)}`);
      })
      .catch(reject);
  });
}

export interface UploadStudyAttachmentOptions {
  file: File | Blob;
  fileName: string;
  attachmentId?: string;
  noteId?: string;
  sessionId?: string;
  cloudSyncEnabled?: boolean;
  onProgress?: (progressPct: number) => void;
}

/**
 * Phase 4 — Local-First Hybrid Attachment Storage:
 * 1. Validates magic bytes and 10 MB limit.
 * 2. Computes SHA-256 digest.
 * 3. Stores binary Blob in `rbi_prep_os_2027` IndexedDB (`attachmentBlobs` + `attachments`).
 * 4. If in Local Workspace mode (or offline / unsigned), completes immediately with `local_stored` or `pending_offline`.
 * 5. Only attempts Firebase Storage upload when authenticated and Cloud Sync is active.
 */
export async function uploadStudyAttachment(
  options: UploadStudyAttachmentOptions
): Promise<VaultAttachment> {
  const { file, fileName, noteId, sessionId, onProgress } = options;

  const magicCheck = await validateFileMagicBytes(file, file.type || undefined);
  if (!magicCheck.valid || !magicCheck.detectedMime) {
    throw new Error(magicCheck.reason || 'File validation failed.');
  }

  const detectedMime = magicCheck.detectedMime;
  const safeFileName = sanitizeStorageFilename(fileName, detectedMime);
  const checksum = await computeBlobSha256(file);
  const attachmentId = options.attachmentId || generateAttachmentId('att');
  const createdAtIso = new Date().toISOString();
  const currentUser = auth?.currentUser || null;
  const ownerUid = currentUser?.uid || 'local_workspace';

  const dedupeKey = `${ownerUid}:${attachmentId}:${checksum}`;
  const existingInFlight = inFlightUploads.get(dedupeKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const uploadTaskPromise = (async (): Promise<VaultAttachment> => {
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    const shouldAttemptCloud =
      Boolean(currentUser && currentUser.emailVerified && isOnline) &&
      options.cloudSyncEnabled !== false;

    const initialStatus = shouldAttemptCloud ? 'pending_offline' : 'local_stored';

    try {
      await saveOfflineAttachmentBlob({
        attachmentId,
        ownerUid,
        noteId,
        sessionId,
        fileName: safeFileName,
        mimeType: detectedMime,
        sizeBytes: file.size,
        checksum,
        syncStatus: initialStatus,
        createdAtIso,
        updatedAtIso: createdAtIso,
        blob: file,
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        throw new Error(
          'Browser storage quota exceeded: Could not save attachment binary to IndexedDB. Please export a Complete ZIP Backup and free space.'
        );
      }
      throw err;
    }

    if (!shouldAttemptCloud || !currentUser) {
      onProgress?.(100);
      return {
        id: attachmentId,
        ownerWorkspaceId: ownerUid,
        ownerUid,
        noteId,
        sessionId,
        originalFilename: safeFileName,
        fileName: safeFileName,
        mimeType: detectedMime,
        byteSize: file.size,
        sizeBytes: file.size,
        sha256: checksum,
        checksum,
        localBlobId: attachmentId,
        uploadStatus: initialStatus,
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        createdAtIso,
        updatedAtIso: createdAtIso,
      };
    }

    const storagePath = buildStudyAttachmentPath(
      currentUser.uid,
      attachmentId,
      safeFileName,
      detectedMime
    );
    const storageRef = ref(storage, storagePath);

    try {
      await updateOfflineAttachmentStatus(attachmentId, 'uploading', storagePath);

      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: detectedMime,
          customMetadata: {
            attachmentId,
            ownerUid: currentUser.uid,
            noteId: noteId || '',
            sessionId: sessionId || '',
            checksum,
            createdAtIso,
          },
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const pct = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              onProgress?.(pct);
            }
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const meta = await getMetadata(storageRef);
      if (meta.size !== file.size) {
        throw new Error(
          `Uploaded byte size mismatch (expected ${file.size}, got ${meta.size}).`
        );
      }

      await updateOfflineAttachmentStatus(attachmentId, 'uploaded', storagePath);
      onProgress?.(100);

      return {
        id: attachmentId,
        ownerWorkspaceId: currentUser.uid,
        ownerUid: currentUser.uid,
        noteId,
        sessionId,
        originalFilename: safeFileName,
        fileName: safeFileName,
        mimeType: detectedMime,
        byteSize: file.size,
        sizeBytes: file.size,
        sha256: checksum,
        checksum,
        localBlobId: attachmentId,
        cloudStoragePath: storagePath,
        storagePath,
        uploadStatus: 'uploaded',
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        createdAtIso,
        updatedAtIso: createdAtIso,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Firebase Storage upload failed.';
      await updateOfflineAttachmentStatus(
        attachmentId,
        'failed',
        storagePath,
        errorMessage
      );
      return {
        id: attachmentId,
        ownerWorkspaceId: currentUser.uid,
        ownerUid: currentUser.uid,
        noteId,
        sessionId,
        originalFilename: safeFileName,
        fileName: safeFileName,
        mimeType: detectedMime,
        byteSize: file.size,
        sizeBytes: file.size,
        sha256: checksum,
        checksum,
        localBlobId: attachmentId,
        cloudStoragePath: storagePath,
        storagePath,
        uploadStatus: 'failed',
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        createdAtIso,
        updatedAtIso: createdAtIso,
        uploadError: errorMessage,
      };
    }
  })();

  inFlightUploads.set(dedupeKey, uploadTaskPromise);
  try {
    return await uploadTaskPromise;
  } finally {
    inFlightUploads.delete(dedupeKey);
  }
}

export async function retryAttachmentUpload(
  attachment: VaultAttachment,
  onProgress?: (pct: number) => void
): Promise<VaultAttachment> {
  const localEntry = await getOfflineAttachmentEntry(
    attachment.localBlobId || attachment.id
  );
  let blob: Blob | null = localEntry?.blob || null;

  if (!blob && attachment.dataUrl && attachment.dataUrl.startsWith('data:')) {
    blob = dataUrlToBlob(attachment.dataUrl).blob;
  }

  if (!blob) {
    throw new Error(
      'Local file bytes are not available to retry upload. Please re-select the file.'
    );
  }

  return uploadStudyAttachment({
    file: blob,
    fileName: attachment.fileName || attachment.originalFilename || 'attachment',
    attachmentId: attachment.id,
    noteId: attachment.noteId,
    sessionId: attachment.sessionId,
    onProgress,
  });
}

export async function downloadStudyAttachmentBlob(
  attachment: VaultAttachment
): Promise<Blob> {
  // 1. Check local IndexedDB cache first (`rbi_prep_os_2027` attachmentBlobs store)
  const localEntry = await getOfflineAttachmentEntry(
    attachment.localBlobId || attachment.id
  );
  if (localEntry?.blob) {
    return localEntry.blob;
  }

  // 2. Download from Firebase Storage if storagePath exists
  const cloudPath = attachment.storagePath || attachment.cloudStoragePath;
  if (cloudPath) {
    const currentUser = auth?.currentUser;
    if (!currentUser) {
      throw new Error('Sign in required to download cloud-stored attachment.');
    }
    const storageRef = ref(storage, cloudPath);
    const blob = await getBlob(storageRef);
    return blob;
  }

  // 3. Fallback to legacy embedded dataUrl if not yet migrated
  if (attachment.dataUrl && attachment.dataUrl.startsWith('data:')) {
    return dataUrlToBlob(attachment.dataUrl).blob;
  }

  throw new Error(`Attachment "${attachment.fileName}" has no accessible source.`);
}

export async function resolveAttachmentPreviewUrl(
  attachment: VaultAttachment
): Promise<{ url: string; revoke: () => void }> {
  const blob = await downloadStudyAttachmentBlob(attachment);
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function deleteStudyAttachment(attachment: VaultAttachment): Promise<void> {
  const cloudPath = attachment.storagePath || attachment.cloudStoragePath;
  if (cloudPath && auth?.currentUser) {
    try {
      const storageRef = ref(storage, cloudPath);
      await deleteObject(storageRef);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'storage/object-not-found') {
        throw err;
      }
    }
  }
  await deleteOfflineAttachmentBlob(attachment.localBlobId || attachment.id);
}

/**
 * Strips embedded base64 `dataUrl` when preparing attachment metadata for persistence
 * once the attachment is backed by IndexedDB (`localBlobId`) or Firebase Storage (`storagePath`).
 */
export function sanitizeAttachmentForFirestore(att: VaultAttachment): VaultAttachment {
  const hasExternalBacking = Boolean(att.storagePath || att.cloudStoragePath || att.localBlobId);
  const nowIso = new Date().toISOString();
  const created = att.createdAt || att.createdAtIso || nowIso;
  const sha = att.sha256 || att.checksum;
  const size = att.byteSize ?? att.sizeBytes;
  const origName = att.originalFilename || att.fileName;
  const cloudPath = att.cloudStoragePath || att.storagePath;

  const cleaned: VaultAttachment = {
    id: att.id,
    ownerWorkspaceId: att.ownerWorkspaceId || att.ownerUid || 'local_workspace',
    ownerUid: att.ownerUid || att.ownerWorkspaceId || 'local_user',
    noteId: att.noteId,
    sessionId: att.sessionId,
    originalFilename: origName,
    fileName: origName,
    mimeType: att.mimeType,
    byteSize: size,
    sizeBytes: size,
    sha256: sha,
    checksum: sha,
    localBlobId: att.localBlobId,
    cloudStoragePath: cloudPath,
    storagePath: cloudPath,
    uploadStatus:
      att.uploadStatus ||
      (cloudPath ? 'uploaded' : att.localBlobId ? 'local_stored' : att.dataUrl ? 'legacy_embedded' : 'local_stored'),
    createdAt: created,
    updatedAt: att.updatedAt || att.updatedAtIso || nowIso,
    createdAtIso: created,
    updatedAtIso: att.updatedAtIso || att.updatedAt || nowIso,
    extractedText: att.extractedText,
    uploadError: att.uploadError,
  };

  if (!hasExternalBacking && att.dataUrl) {
    cleaned.dataUrl = att.dataUrl;
  }

  return cleaned;
}
