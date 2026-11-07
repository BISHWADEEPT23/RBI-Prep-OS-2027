import React, { useEffect, useState } from 'react';
import { resolveAttachmentPreviewUrl } from '../storage';
import { VaultAttachment } from '../types';

interface AttachmentCardProps {
  attachment: VaultAttachment;
  onZoom: (attachment: VaultAttachment, resolvedUrl: string) => void;
  onRetryUpload?: (attachment: VaultAttachment) => Promise<void>;
  onRequestRemove?: (attachment: VaultAttachment) => void;
  compact?: boolean;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AttachmentCard: React.FC<AttachmentCardProps> = ({
  attachment,
  onZoom,
  onRetryUpload,
  onRequestRemove,
  compact = false,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let revokeFn: (() => void) | null = null;

    setLoadingPreview(true);
    setPreviewError(null);

    resolveAttachmentPreviewUrl(attachment)
      .then(({ url, revoke }) => {
        if (!active) {
          revoke();
          return;
        }
        revokeFn = revoke;
        setPreviewUrl(url);
      })
      .catch((err) => {
        if (!active) return;
        setPreviewError(
          err instanceof Error ? err.message : 'Preview unavailable'
        );
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
      if (revokeFn) revokeFn();
    };
  }, [
    attachment.id,
    attachment.storagePath,
    attachment.localBlobId,
    attachment.dataUrl,
    attachment.uploadStatus,
  ]);

  const status =
    attachment.uploadStatus ||
    (attachment.storagePath
      ? 'uploaded'
      : attachment.localBlobId
      ? 'local_stored'
      : attachment.dataUrl
      ? 'legacy_embedded'
      : 'local_stored');

  const statusBadge = () => {
    switch (status) {
      case 'local_stored':
        return (
          <span className="px-2 py-0.5 rounded-full bg-[#def4ef] text-[#0c695d] text-[10px] font-semibold">
            ✓ Saved on Device
          </span>
        );
      case 'uploaded':
        return (
          <span className="px-2 py-0.5 rounded-full bg-[#def4ef] text-[#0c695d] text-[10px] font-semibold">
            ☁ Storage Synced
          </span>
        );
      case 'pending_offline':
        return (
          <span className="px-2 py-0.5 rounded-full bg-[#fff4d6] text-[#7a5200] text-[10px] font-semibold">
            ⏳ Pending Offline
          </span>
        );
      case 'uploading':
        return (
          <span className="px-2 py-0.5 rounded-full bg-[#e0f2fe] text-[#0369a1] text-[10px] font-semibold">
            ↑ Uploading {attachment.uploadProgress ?? 0}%
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-full bg-[#ffe8e5] text-[#8a1f17] text-[10px] font-semibold">
            ⚠ Upload Failed
          </span>
        );
      case 'legacy_embedded':
        return (
          <span className="px-2 py-0.5 rounded-full bg-[#f3e8ff] text-[#6b21a8] text-[10px] font-semibold">
            📦 Legacy Base64
          </span>
        );
    }
  };

  const isPdf = attachment.mimeType === 'application/pdf';

  return (
    <div className="p-2.5 rounded-[14px] bg-[var(--md-surface)] border border-[var(--md-outline-variant)] flex flex-col justify-between gap-2">
      <div className="flex items-start gap-2.5">
        {/* Thumbnail or PDF Icon */}
        <button
          type="button"
          onClick={() => previewUrl && onZoom(attachment, previewUrl)}
          disabled={!previewUrl}
          title={previewUrl ? 'Click to zoom / preview attachment' : 'Preview loading'}
          className={`${
            compact ? 'w-12 h-12' : 'w-16 h-16'
          } rounded-[10px] bg-[var(--md-surface-container)] border border-[var(--md-outline-variant)]/60 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer disabled:cursor-default`}
        >
          {loadingPreview ? (
            <span className="text-[10px] text-[var(--md-on-surface-variant)]">...</span>
          ) : isPdf ? (
            <div className="flex flex-col items-center justify-center text-[#158e7f]">
              <span className="material-symbols-rounded text-[22px]">picture_as_pdf</span>
              <span className="text-[9px] font-bold">PDF</span>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={attachment.fileName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="material-symbols-rounded text-[20px] text-[var(--md-on-surface-variant)]">
              broken_image
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <p
              className="text-xs font-semibold text-[var(--md-on-surface)] truncate"
              title={attachment.fileName}
            >
              {attachment.fileName}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {statusBadge()}
            <span className="text-[10px] font-mono-tabular text-[var(--md-on-surface-variant)]">
              {formatBytes(attachment.sizeBytes)}
            </span>
            {attachment.checksum && (
              <span
                title={`SHA-256: ${attachment.checksum}`}
                className="text-[10px] font-mono-tabular text-[var(--md-on-surface-variant)] opacity-75"
              >
                #{attachment.checksum.slice(0, 8)}
              </span>
            )}
          </div>

          {attachment.storagePath && (
            <p
              className="text-[10px] font-mono-tabular text-[var(--md-on-surface-variant)] truncate opacity-80"
              title={attachment.storagePath}
            >
              {attachment.storagePath}
            </p>
          )}

          {(attachment.uploadError || previewError) && (
            <p className="text-[10px] text-[var(--md-error)]">
              {attachment.uploadError || previewError}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-[var(--md-outline-variant)]/40">
        {previewUrl && (
          <button
            type="button"
            onClick={() => onZoom(attachment, previewUrl)}
            className="px-2.5 py-1 rounded-full bg-[var(--md-surface-container)] text-[11px] font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container-high)] cursor-pointer"
          >
            {isPdf ? 'Open PDF' : 'Zoom'}
          </button>
        )}

        {(status === 'failed' || status === 'pending_offline') && onRetryUpload && (
          <button
            type="button"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetryUpload(attachment);
              } finally {
                setRetrying(false);
              }
            }}
            className="px-2.5 py-1 rounded-full bg-[#199989] text-white text-[11px] font-semibold hover:opacity-95 cursor-pointer disabled:opacity-50"
          >
            {retrying ? 'Retrying...' : '↻ Retry Upload'}
          </button>
        )}

        {onRequestRemove && (
          <button
            type="button"
            onClick={() => onRequestRemove(attachment)}
            className="px-2 py-1 rounded-full text-[11px] font-medium text-[var(--md-error)] hover:bg-[var(--md-error-container)]/30 cursor-pointer"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
};
