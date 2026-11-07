import { getBlob, getMetadata, ref } from 'firebase/storage';
import {
  dbGetAllMigrationCheckpoints,
  dbGetAttachmentBlob,
  dbSaveAttachmentBlobAndMeta,
  dbSaveMigrationCheckpoint,
} from './db/localDb';
import { auth, storage } from './firebase';
import {
  buildStudyAttachmentPath,
  computeBlobSha256,
  dataUrlToBlob,
  sanitizeStorageFilename,
  uploadStudyAttachment,
  validateFileMagicBytes,
} from './storage';
import { VaultAttachment, VaultNoteRecord } from './types';

export interface LegacyAttachmentInventoryItem {
  noteId: string;
  noteTitle: string;
  subject: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  estimatedDecodedBytes: number;
  base64StringLength: number;
}

export interface LegacyMigrationInventory {
  totalLegacyNotes: number;
  totalLegacyAttachments: number;
  totalBase64Chars: number;
  totalEstimatedBytes: number;
  items: LegacyAttachmentInventoryItem[];
}

export interface MigrationCheckpointRecord {
  attachmentId: string;
  noteId: string;
  storagePath: string;
  checksum: string;
  sizeBytes: number;
  verifiedAtIso: string;
}

export interface MigrationItemResult {
  noteId: string;
  noteTitle: string;
  attachmentId: string;
  fileName: string;
  status: 'migrated_and_verified' | 'skipped_already_migrated' | 'failed_preserved_original';
  storagePath?: string;
  localBlobId?: string;
  checksum?: string;
  bytesFreedFromFirestore: number;
  error?: string;
}

export interface MigrationExecutionReport {
  startedAtIso: string;
  completedAtIso: string;
  targetMode?: 'local_indexeddb' | 'firebase_storage';
  totalInspected: number;
  migratedCount: number;
  alreadyMigratedCount: number;
  failedCount: number;
  totalFirestoreBytesFreed: number;
  results: MigrationItemResult[];
}

const MIGRATION_CHECKPOINT_KEY = 'rbi_prep_os_2027_migration_checkpoints_v2';

export function loadMigrationCheckpoints(): Record<string, MigrationCheckpointRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(MIGRATION_CHECKPOINT_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveMigrationCheckpoint(checkpoint: MigrationCheckpointRecord): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const current = loadMigrationCheckpoints();
      current[`${checkpoint.noteId}:${checkpoint.attachmentId}`] = checkpoint;
      localStorage.setItem(MIGRATION_CHECKPOINT_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.warn('[Migration] Could not persist migration checkpoint:', e);
  }
}

/**
 * Scans all notes to identify legacy embedded base64 attachments
 * and produces a complete pre-migration inventory.
 */
export function scanLegacyEmbeddedAttachments(
  notes: VaultNoteRecord[]
): LegacyMigrationInventory {
  const items: LegacyAttachmentInventoryItem[] = [];
  const notesWithLegacy = new Set<string>();
  let totalBase64Chars = 0;
  let totalEstimatedBytes = 0;

  for (const note of notes) {
    for (const att of note.attachments || []) {
      const hasEmbeddedDataUrl = Boolean(
        att.dataUrl &&
          att.dataUrl.startsWith('data:') &&
          !att.storagePath &&
          !att.localBlobId
      );
      if (hasEmbeddedDataUrl && att.dataUrl) {
        notesWithLegacy.add(note.id);
        const base64Len = att.dataUrl.length;
        const estimatedBytes = att.sizeBytes || Math.round((base64Len * 3) / 4);
        totalBase64Chars += base64Len;
        totalEstimatedBytes += estimatedBytes;
        items.push({
          noteId: note.id,
          noteTitle: note.title,
          subject: note.subject,
          attachmentId: att.id,
          fileName: att.fileName,
          mimeType: att.mimeType,
          estimatedDecodedBytes: estimatedBytes,
          base64StringLength: base64Len,
        });
      }
    }
  }

  return {
    totalLegacyNotes: notesWithLegacy.size,
    totalLegacyAttachments: items.length,
    totalBase64Chars,
    totalEstimatedBytes,
    items,
  };
}

/**
 * Phase 4 (v5.0 Local-First): Migrates legacy embedded base64 attachments directly into
 * local IndexedDB (`rbi_prep_os_2027` -> `attachmentBlobs` & `attachments`) WITHOUT requiring
 * Google Sign-In or Firebase connectivity.
 * Verifies SHA-256 checksum on read-back before removing `dataUrl`.
 */
export async function runLocalLegacyAttachmentMigration(options: {
  notes: VaultNoteRecord[];
  saveMigratedNote: (note: VaultNoteRecord) => Promise<VaultNoteRecord>;
  onProgress?: (current: number, total: number, statusText: string) => void;
}): Promise<MigrationExecutionReport> {
  const startedAtIso = new Date().toISOString();
  const idbCheckpoints = await dbGetAllMigrationCheckpoints();
  const results: MigrationItemResult[] = [];
  let migratedCount = 0;
  let alreadyMigratedCount = 0;
  let failedCount = 0;
  let totalFirestoreBytesFreed = 0;

  const targetNotes = options.notes.filter((n) =>
    (n.attachments || []).some(
      (att) =>
        att.dataUrl &&
        att.dataUrl.startsWith('data:') &&
        !att.storagePath &&
        !att.localBlobId
    )
  );

  const totalAttachmentsToInspect = targetNotes.reduce(
    (acc, n) =>
      acc +
      (n.attachments || []).filter(
        (att) =>
          att.dataUrl &&
          att.dataUrl.startsWith('data:') &&
          !att.storagePath &&
          !att.localBlobId
      ).length,
    0
  );

  let processedIdx = 0;

  for (const note of targetNotes) {
    let noteModified = false;
    const updatedAttachments: VaultAttachment[] = [];

    for (const att of note.attachments || []) {
      const isLegacyEmbedded = Boolean(
        att.dataUrl &&
          att.dataUrl.startsWith('data:') &&
          !att.storagePath &&
          !att.localBlobId
      );

      if (!isLegacyEmbedded || !att.dataUrl) {
        updatedAttachments.push(att);
        continue;
      }

      processedIdx++;
      const checkpointKey = `${note.id}:${att.id}`;
      const existingCheckpoint = idbCheckpoints[checkpointKey];
      const originalDataUrlLength = att.dataUrl.length;

      options.onProgress?.(
        processedIdx,
        totalAttachmentsToInspect,
        `Migrating "${att.fileName}" to local IndexedDB...`
      );

      try {
        const { blob } = dataUrlToBlob(att.dataUrl);
        const magic = await validateFileMagicBytes(blob, att.mimeType);
        if (!magic.valid || !magic.detectedMime) {
          throw new Error(magic.reason || 'Legacy attachment failed magic-byte check.');
        }

        const checksum = await computeBlobSha256(blob);
        const safeFileName = sanitizeStorageFilename(att.fileName, magic.detectedMime);
        const nowIso = new Date().toISOString();

        let verifiedBlobId = '';

        if (existingCheckpoint && existingCheckpoint.checksum === checksum) {
          const readBack = await dbGetAttachmentBlob(
            existingCheckpoint.localBlobId || att.id
          );
          if (readBack && readBack.size === blob.size) {
            const readBackSha = await computeBlobSha256(readBack);
            if (readBackSha === checksum) {
              verifiedBlobId = existingCheckpoint.localBlobId || att.id;
              alreadyMigratedCount++;
            }
          }
        }

        if (!verifiedBlobId) {
          const candidateMeta: VaultAttachment = {
            id: att.id,
            ownerWorkspaceId: 'local_workspace',
            ownerUid: 'local_user',
            noteId: note.id,
            sessionId: note.sessionId,
            originalFilename: safeFileName,
            fileName: safeFileName,
            mimeType: magic.detectedMime,
            byteSize: blob.size,
            sizeBytes: blob.size,
            sha256: checksum,
            checksum,
            localBlobId: att.id,
            uploadStatus: 'local_stored',
            createdAt: att.createdAtIso || note.createdAtIso,
            updatedAt: nowIso,
            createdAtIso: att.createdAtIso || note.createdAtIso,
            updatedAtIso: nowIso,
            extractedText: att.extractedText,
          };

          await dbSaveAttachmentBlobAndMeta(candidateMeta, blob);

          // Strict Read-Back Verification from IndexedDB before removing `dataUrl`
          const readBackBlob = await dbGetAttachmentBlob(att.id);
          if (!readBackBlob || readBackBlob.size !== blob.size) {
            throw new Error(
              'IndexedDB read-back size mismatch; preserving original embedded dataUrl.'
            );
          }
          const readBackSha = await computeBlobSha256(readBackBlob);
          if (readBackSha !== checksum) {
            throw new Error(
              'IndexedDB read-back SHA-256 verification failed; preserving original embedded dataUrl.'
            );
          }

          verifiedBlobId = att.id;
          await dbSaveMigrationCheckpoint({
            id: checkpointKey,
            noteId: note.id,
            attachmentId: att.id,
            targetType: 'local_indexeddb',
            localBlobId: verifiedBlobId,
            checksum,
            sizeBytes: blob.size,
            verifiedAtIso: nowIso,
          });
          saveMigrationCheckpoint({
            attachmentId: att.id,
            noteId: note.id,
            storagePath: `local_idb://${verifiedBlobId}`,
            checksum,
            sizeBytes: blob.size,
            verifiedAtIso: nowIso,
          });
          migratedCount++;
        }

        // Strip `dataUrl` only after verified IndexedDB binary read-back
        const migratedAttachment: VaultAttachment = {
          id: att.id,
          ownerWorkspaceId: 'local_workspace',
          ownerUid: 'local_user',
          noteId: note.id,
          sessionId: note.sessionId,
          originalFilename: safeFileName,
          fileName: safeFileName,
          mimeType: magic.detectedMime,
          byteSize: blob.size,
          sizeBytes: blob.size,
          sha256: checksum,
          checksum,
          localBlobId: verifiedBlobId,
          uploadStatus: 'local_stored',
          createdAt: att.createdAtIso || note.createdAtIso,
          updatedAt: nowIso,
          createdAtIso: att.createdAtIso || note.createdAtIso,
          updatedAtIso: nowIso,
          extractedText: att.extractedText,
        };

        updatedAttachments.push(migratedAttachment);
        noteModified = true;
        totalFirestoreBytesFreed += originalDataUrlLength;

        results.push({
          noteId: note.id,
          noteTitle: note.title,
          attachmentId: att.id,
          fileName: safeFileName,
          status: existingCheckpoint ? 'skipped_already_migrated' : 'migrated_and_verified',
          localBlobId: verifiedBlobId,
          storagePath: `local_idb://${verifiedBlobId}`,
          checksum,
          bytesFreedFromFirestore: originalDataUrlLength,
        });
      } catch (err) {
        failedCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        updatedAttachments.push({
          ...att,
          uploadStatus: 'legacy_embedded',
          uploadError: `Local migration failed (original preserved): ${errMsg}`,
        });
        results.push({
          noteId: note.id,
          noteTitle: note.title,
          attachmentId: att.id,
          fileName: att.fileName,
          status: 'failed_preserved_original',
          bytesFreedFromFirestore: 0,
          error: errMsg,
        });
      }
    }

    if (noteModified) {
      await options.saveMigratedNote({
        ...note,
        attachments: updatedAttachments,
      });
    }
  }

  return {
    startedAtIso,
    completedAtIso: new Date().toISOString(),
    targetMode: 'local_indexeddb',
    totalInspected: totalAttachmentsToInspect,
    migratedCount,
    alreadyMigratedCount,
    failedCount,
    totalFirestoreBytesFreed,
    results,
  };
}

/**
 * Optional Cloud Firebase Storage migration of legacy embedded base64 attachments
 * (used when Cloud Sync is enabled and user is authenticated).
 */
export async function runLegacyAttachmentMigration(options: {
  notes: VaultNoteRecord[];
  saveMigratedNote: (note: VaultNoteRecord) => Promise<VaultNoteRecord>;
  onProgress?: (current: number, total: number, statusText: string) => void;
}): Promise<MigrationExecutionReport> {
  const startedAtIso = new Date().toISOString();
  const currentUser = auth?.currentUser;

  if (!currentUser || !currentUser.emailVerified) {
    throw new Error(
      'Authenticated user with a verified Google email is required to migrate legacy attachments to Firebase Storage. Use "Migrate to Local IndexedDB" for offline/local migration without sign-in.'
    );
  }

  const checkpoints = loadMigrationCheckpoints();
  const results: MigrationItemResult[] = [];
  let migratedCount = 0;
  let alreadyMigratedCount = 0;
  let failedCount = 0;
  let totalFirestoreBytesFreed = 0;

  const targetNotes = options.notes.filter((n) =>
    (n.attachments || []).some(
      (att) => att.dataUrl && att.dataUrl.startsWith('data:') && !att.storagePath
    )
  );

  const totalAttachmentsToInspect = targetNotes.reduce(
    (acc, n) =>
      acc +
      (n.attachments || []).filter(
        (att) => att.dataUrl && att.dataUrl.startsWith('data:') && !att.storagePath
      ).length,
    0
  );

  let processedIdx = 0;

  for (const note of targetNotes) {
    let noteModified = false;
    const updatedAttachments: VaultAttachment[] = [];

    for (const att of note.attachments || []) {
      const isLegacyEmbedded = Boolean(
        att.dataUrl && att.dataUrl.startsWith('data:') && !att.storagePath
      );

      if (!isLegacyEmbedded || !att.dataUrl) {
        updatedAttachments.push(att);
        continue;
      }

      processedIdx++;
      const checkpointKey = `${note.id}:${att.id}`;
      const existingCheckpoint = checkpoints[checkpointKey];
      const originalDataUrlLength = att.dataUrl.length;

      options.onProgress?.(
        processedIdx,
        totalAttachmentsToInspect,
        `Migrating "${att.fileName}" from note "${note.title}"...`
      );

      try {
        const { blob } = dataUrlToBlob(att.dataUrl);
        const magic = await validateFileMagicBytes(blob, att.mimeType);
        if (!magic.valid || !magic.detectedMime) {
          throw new Error(magic.reason || 'Legacy attachment failed magic-byte check.');
        }

        const checksum = await computeBlobSha256(blob);
        const safeFileName = sanitizeStorageFilename(att.fileName, magic.detectedMime);

        let verifiedPath = '';

        if (
          existingCheckpoint &&
          existingCheckpoint.checksum === checksum &&
          !existingCheckpoint.storagePath.startsWith('local_idb://')
        ) {
          try {
            const existingRef = ref(storage, existingCheckpoint.storagePath);
            const meta = await getMetadata(existingRef);
            const readBackBlob = await getBlob(existingRef);
            if (meta.size === blob.size && readBackBlob.size === blob.size) {
              verifiedPath = existingCheckpoint.storagePath;
              alreadyMigratedCount++;
            }
          } catch {
            verifiedPath = '';
          }
        }

        if (!verifiedPath) {
          const uploadedAtt = await uploadStudyAttachment({
            file: blob,
            fileName: safeFileName,
            attachmentId: att.id,
            noteId: note.id,
            sessionId: note.sessionId,
            cloudSyncEnabled: true,
          });

          if (uploadedAtt.uploadStatus !== 'uploaded' || !uploadedAtt.storagePath) {
            throw new Error(
              uploadedAtt.uploadError ||
                `Upload did not reach 'uploaded' status (status: ${uploadedAtt.uploadStatus}).`
            );
          }

          const storageRef = ref(storage, uploadedAtt.storagePath);
          const meta = await getMetadata(storageRef);
          if (meta.size !== blob.size) {
            throw new Error(
              `Storage metadata size mismatch: expected ${blob.size}, found ${meta.size}.`
            );
          }

          const readBackBlob = await getBlob(storageRef);
          const readBackChecksum = await computeBlobSha256(readBackBlob);
          if (readBackBlob.size !== blob.size || readBackChecksum !== checksum) {
            throw new Error(
              'Read-back checksum verification failed; preserving original embedded dataUrl.'
            );
          }

          verifiedPath = uploadedAtt.storagePath;
          const nowIso = new Date().toISOString();
          saveMigrationCheckpoint({
            attachmentId: att.id,
            noteId: note.id,
            storagePath: verifiedPath,
            checksum,
            sizeBytes: blob.size,
            verifiedAtIso: nowIso,
          });
          await dbSaveMigrationCheckpoint({
            id: checkpointKey,
            noteId: note.id,
            attachmentId: att.id,
            targetType: 'firebase_storage',
            storagePath: verifiedPath,
            localBlobId: att.id,
            checksum,
            sizeBytes: blob.size,
            verifiedAtIso: nowIso,
          });
          migratedCount++;
        }

        const migratedAttachment: VaultAttachment = {
          id: att.id,
          ownerWorkspaceId: currentUser.uid,
          ownerUid: currentUser.uid,
          noteId: note.id,
          sessionId: note.sessionId,
          originalFilename: safeFileName,
          fileName: safeFileName,
          mimeType: magic.detectedMime,
          byteSize: blob.size,
          sizeBytes: blob.size,
          cloudStoragePath: verifiedPath,
          storagePath: verifiedPath,
          uploadStatus: 'uploaded',
          createdAt: att.createdAtIso || note.createdAtIso,
          updatedAt: new Date().toISOString(),
          createdAtIso: att.createdAtIso || note.createdAtIso,
          updatedAtIso: new Date().toISOString(),
          sha256: checksum,
          checksum,
          localBlobId: att.id,
          extractedText: att.extractedText,
        };

        updatedAttachments.push(migratedAttachment);
        noteModified = true;
        totalFirestoreBytesFreed += originalDataUrlLength;

        results.push({
          noteId: note.id,
          noteTitle: note.title,
          attachmentId: att.id,
          fileName: safeFileName,
          status: existingCheckpoint ? 'skipped_already_migrated' : 'migrated_and_verified',
          storagePath: verifiedPath,
          localBlobId: att.id,
          checksum,
          bytesFreedFromFirestore: originalDataUrlLength,
        });
      } catch (err) {
        failedCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        updatedAttachments.push({
          ...att,
          uploadStatus: 'legacy_embedded',
          uploadError: `Migration failed (original preserved): ${errMsg}`,
        });
        results.push({
          noteId: note.id,
          noteTitle: note.title,
          attachmentId: att.id,
          fileName: att.fileName,
          status: 'failed_preserved_original',
          bytesFreedFromFirestore: 0,
          error: errMsg,
        });
      }
    }

    if (noteModified) {
      await options.saveMigratedNote({
        ...note,
        attachments: updatedAttachments,
      });
    }
  }

  return {
    startedAtIso,
    completedAtIso: new Date().toISOString(),
    targetMode: 'firebase_storage',
    totalInspected: totalAttachmentsToInspect,
    migratedCount,
    alreadyMigratedCount,
    failedCount,
    totalFirestoreBytesFreed,
    results,
  };
}
