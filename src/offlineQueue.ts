/**
 * Unified Attachment Binary Store & Offline Queue
 * Backed directly by the authoritative `rbi_prep_os_2027` IndexedDB (`attachments` & `attachmentBlobs` stores).
 * Automatically migrates any legacy `rbi_prep_os_2027_attachments_idb` entries so there are no competing databases.
 */

import {
  dbDeleteAttachmentBlobAndMeta,
  dbGetAllAttachmentsMeta,
  dbGetAttachmentBlob,
  dbGetAttachmentMeta,
  dbSaveAttachmentBlobAndMeta,
  getLocalDb,
} from './db/localDb';
import { VaultAttachment } from './types';

export interface OfflineAttachmentEntry {
  attachmentId: string;
  ownerUid: string;
  noteId?: string;
  sessionId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath?: string;
  syncStatus: 'local_stored' | 'pending_offline' | 'uploading' | 'uploaded' | 'failed';
  createdAtIso: string;
  updatedAtIso: string;
  lastError?: string;
  blob: Blob;
}

export async function saveOfflineAttachmentBlob(entry: OfflineAttachmentEntry): Promise<void> {
  const meta: VaultAttachment = {
    id: entry.attachmentId,
    ownerWorkspaceId: entry.ownerUid || 'local_workspace',
    ownerUid: entry.ownerUid || 'local_user',
    noteId: entry.noteId,
    sessionId: entry.sessionId,
    originalFilename: entry.fileName,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    byteSize: entry.sizeBytes,
    sizeBytes: entry.sizeBytes,
    sha256: entry.checksum,
    checksum: entry.checksum,
    localBlobId: entry.attachmentId,
    cloudStoragePath: entry.storagePath,
    storagePath: entry.storagePath,
    uploadStatus: entry.syncStatus,
    createdAt: entry.createdAtIso,
    updatedAt: entry.updatedAtIso,
    createdAtIso: entry.createdAtIso,
    updatedAtIso: entry.updatedAtIso,
    uploadError: entry.lastError,
  };
  await dbSaveAttachmentBlobAndMeta(meta, entry.blob);
}

export async function getOfflineAttachmentEntry(
  attachmentId: string
): Promise<OfflineAttachmentEntry | null> {
  const [meta, blob] = await Promise.all([
    dbGetAttachmentMeta(attachmentId),
    dbGetAttachmentBlob(attachmentId),
  ]);
  if (!blob) return null;
  const nowIso = new Date().toISOString();
  return {
    attachmentId,
    ownerUid: meta?.ownerUid || meta?.ownerWorkspaceId || 'local_user',
    noteId: meta?.noteId,
    sessionId: meta?.sessionId,
    fileName: meta?.fileName || meta?.originalFilename || 'attachment',
    mimeType: meta?.mimeType || blob.type || 'image/png',
    sizeBytes: blob.size,
    checksum: meta?.checksum || meta?.sha256 || '',
    storagePath: meta?.storagePath || meta?.cloudStoragePath,
    syncStatus:
      meta?.uploadStatus === 'legacy_embedded'
        ? 'local_stored'
        : meta?.uploadStatus || 'local_stored',
    createdAtIso: meta?.createdAtIso || meta?.createdAt || nowIso,
    updatedAtIso: meta?.updatedAtIso || meta?.updatedAt || nowIso,
    lastError: meta?.uploadError,
    blob,
  };
}

export async function listPendingOfflineAttachments(): Promise<OfflineAttachmentEntry[]> {
  const metas = await dbGetAllAttachmentsMeta();
  const pending = metas.filter(
    (m) =>
      m.uploadStatus === 'pending_offline' ||
      m.uploadStatus === 'failed' ||
      (m.uploadStatus === 'local_stored' && !m.storagePath)
  );
  const results: OfflineAttachmentEntry[] = [];
  for (const m of pending) {
    const blob = await dbGetAttachmentBlob(m.localBlobId || m.id);
    if (blob) {
      results.push({
        attachmentId: m.id,
        ownerUid: m.ownerUid || m.ownerWorkspaceId || 'local_user',
        noteId: m.noteId,
        sessionId: m.sessionId,
        fileName: m.fileName || m.originalFilename || 'attachment',
        mimeType: m.mimeType,
        sizeBytes: blob.size,
        checksum: m.checksum || m.sha256 || '',
        storagePath: m.storagePath || m.cloudStoragePath,
        syncStatus:
          m.uploadStatus === 'legacy_embedded'
            ? 'local_stored'
            : m.uploadStatus || 'local_stored',
        createdAtIso: m.createdAtIso || m.createdAt || new Date().toISOString(),
        updatedAtIso: m.updatedAtIso || m.updatedAt || new Date().toISOString(),
        lastError: m.uploadError,
        blob,
      });
    }
  }
  return results;
}

export async function updateOfflineAttachmentStatus(
  attachmentId: string,
  syncStatus: OfflineAttachmentEntry['syncStatus'],
  storagePath?: string,
  lastError?: string
): Promise<void> {
  const db = await getLocalDb();
  const existing = await dbGetAttachmentMeta(attachmentId);
  if (!existing) return;
  const nowIso = new Date().toISOString();
  await db.put('attachments', {
    ...existing,
    uploadStatus: syncStatus,
    storagePath: storagePath || existing.storagePath,
    cloudStoragePath: storagePath || existing.cloudStoragePath,
    uploadError: lastError,
    updatedAt: nowIso,
    updatedAtIso: nowIso,
  });
}

export async function deleteOfflineAttachmentBlob(attachmentId: string): Promise<void> {
  await dbDeleteAttachmentBlobAndMeta(attachmentId);
}
