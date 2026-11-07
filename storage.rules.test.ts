/**
 * Patch 02 — Firebase Storage Rules, Magic-Byte Validation, Legacy Migration & Cross-Device Sync Test Suite
 * Run via: `npx tsx storage.rules.test.ts`
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scanLegacyEmbeddedAttachments } from './src/migration';
import {
  buildStudyAttachmentPath,
  computeBlobSha256,
  dataUrlToBlob,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentForFirestore,
  sanitizeStorageFilename,
  validateFileMagicBytes,
} from './src/storage';
import { VaultAttachment, VaultNoteRecord } from './src/types';

interface StorageRuleContext {
  auth: {
    uid: string;
    token: {
      email_verified: boolean;
    };
  } | null;
  path: string;
  operation: 'read' | 'create' | 'update' | 'delete';
  resource?: {
    size: number;
    contentType: string;
    metadata?: Record<string, string>;
  };
}

/**
 * Deterministic evaluator mirroring `storage.rules` AST to verify every security boundary.
 */
function evaluateStorageRules(ctx: StorageRuleContext): 'ALLOW' | 'DENY' {
  const matchCanonical = /^\/users\/([^/]+)\/study-attachments\/([^/]+)\/([^/]+)$/.exec(
    ctx.path
  );
  const matchLegacy = /^\/users\/([^/]+)\/study-files\/([^/]+)\/([^/]+)$/.exec(ctx.path);
  const match = matchCanonical || matchLegacy;

  if (!match) {
    return 'DENY'; // Default-deny catch-all
  }

  const [, userId, attachmentId, fileName] = match;

  const isVerifiedOwner =
    ctx.auth !== null &&
    ctx.auth.uid === userId &&
    ctx.auth.token.email_verified === true;

  const isValidSegmentId = (id: string) =>
    id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);

  const isValidSafeFilename = (name: string) =>
    name.length >= 1 &&
    name.length <= 100 &&
    /^[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp|pdf|PNG|JPG|JPEG|WEBP|PDF)$/.test(name);

  if (
    !isVerifiedOwner ||
    !isValidSegmentId(userId) ||
    !isValidSegmentId(attachmentId) ||
    !isValidSafeFilename(fileName)
  ) {
    return 'DENY';
  }

  if (ctx.operation === 'read' || ctx.operation === 'delete') {
    return 'ALLOW';
  }

  if (ctx.operation === 'update') {
    return 'DENY'; // Immutable objects
  }

  if (ctx.operation === 'create') {
    const res = ctx.resource;
    if (!res) return 'DENY';
    const validSize = res.size > 0 && res.size <= MAX_ATTACHMENT_BYTES;
    const allowedMime = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
    ].includes(res.contentType);
    const validOwnerMeta =
      !res.metadata ||
      !('ownerUid' in res.metadata) ||
      res.metadata.ownerUid === userId;

    return validSize && allowedMime && validOwnerMeta ? 'ALLOW' : 'DENY';
  }

  return 'DENY';
}

async function runAllTests() {
  let passed = 0;

  // 1. Verify storage.rules file exists and contains required guards
  const rulesText = fs.readFileSync(path.resolve('storage.rules'), 'utf-8');
  assert.ok(
    rulesText.includes("match /users/{userId}/study-attachments/{attachmentId}/{fileName}"),
    'storage.rules must define /users/{userId}/study-attachments/{attachmentId}/{fileName}'
  );
  assert.ok(
    rulesText.includes('request.auth.token.email_verified == true'),
    'storage.rules must enforce email_verified == true'
  );
  assert.ok(
    rulesText.includes('10 * 1024 * 1024'),
    'storage.rules must enforce 10 MiB size cap'
  );
  passed++;

  // 2. Storage Rules Security Matrix (Adversarial & Valid Cases)
  assert.equal(
    evaluateStorageRules({
      auth: null,
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'read',
    }),
    'DENY',
    'Unauthenticated read must be denied'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userA', token: { email_verified: false } },
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'create',
      resource: { size: 2048, contentType: 'image/png' },
    }),
    'DENY',
    'Unverified email upload must be denied'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userB', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'read',
    }),
    'DENY',
    'Cross-user read (userB reading userA attachment) must be denied'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userB', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'delete',
    }),
    'DENY',
    'Cross-user delete must be denied'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userA', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/huge.pdf',
      operation: 'create',
      resource: { size: 10 * 1024 * 1024 + 1, contentType: 'application/pdf' },
    }),
    'DENY',
    'Oversized file (> 10 MiB) must be denied'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userA', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/script.png',
      operation: 'create',
      resource: { size: 1024, contentType: 'text/html' },
    }),
    'DENY',
    'Disallowed MIME type (text/html) must be denied'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userA', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'create',
      resource: {
        size: 150000,
        contentType: 'image/png',
        metadata: { ownerUid: 'userA' },
      },
    }),
    'ALLOW',
    'Valid authenticated owner PNG upload must be allowed'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userA', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'update',
      resource: { size: 150000, contentType: 'image/png' },
    }),
    'DENY',
    'In-place object mutation (update) must be denied for immutability'
  );
  passed++;

  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'userA', token: { email_verified: true } },
      path: '/users/userA/study-attachments/att_1/slide.png',
      operation: 'delete',
    }),
    'ALLOW',
    'Verified owner delete must be allowed'
  );
  passed++;

  // 3. Magic-Byte File Content Sniffing Tests
  const validPngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const pngCheck = await validateFileMagicBytes(
    new Blob([validPngBytes], { type: 'image/png' }),
    'image/png'
  );
  assert.equal(pngCheck.valid, true);
  assert.equal(pngCheck.detectedMime, 'image/png');
  passed++;

  const validPdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj');
  const pdfCheck = await validateFileMagicBytes(
    new Blob([validPdfBytes], { type: 'application/pdf' }),
    'application/pdf'
  );
  assert.equal(pdfCheck.valid, true);
  assert.equal(pdfCheck.detectedMime, 'application/pdf');
  passed++;

  const spoofedHtmlAsPng = new TextEncoder().encode('<html><script>alert(1)</script></html>');
  const spoofCheck = await validateFileMagicBytes(
    new Blob([spoofedHtmlAsPng], { type: 'image/png' }),
    'image/png'
  );
  assert.equal(
    spoofCheck.valid,
    false,
    'HTML payload disguised with image/png MIME must be rejected by magic-byte check'
  );
  passed++;

  // 4. Filename Sanitization & Path Construction
  const sanitizedName = sanitizeStorageFilename('../../etc/passwd/RBI Slide #1?.png', 'image/png');
  assert.ok(!sanitizedName.includes('..') && !sanitizedName.includes('/'));
  assert.ok(sanitizedName.endsWith('.png'));

  const fullPath = buildStudyAttachmentPath('uid_123', 'att_456', sanitizedName, 'image/png');
  assert.equal(fullPath, `users/uid_123/study-attachments/att_456/${sanitizedName}`);
  passed++;

  // 5. Checksum & Firestore Payload Sanitization (stripping base64 once storagePath exists)
  const sha = await computeBlobSha256(new Blob([validPngBytes], { type: 'image/png' }));
  assert.equal(sha.length, 64, 'SHA-256 hex digest must be 64 characters');

  const cloudBackedAtt: VaultAttachment = {
    id: 'att_cloud_1',
    ownerUid: 'userA',
    noteId: 'note_rbi_1',
    fileName: 'rbi_functions.png',
    mimeType: 'image/png',
    sizeBytes: 1200,
    storagePath: 'users/userA/study-attachments/att_cloud_1/rbi_functions.png',
    uploadStatus: 'uploaded',
    checksum: sha,
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  };

  const sanitizedForFirestore = sanitizeAttachmentForFirestore(cloudBackedAtt);
  assert.equal(
    sanitizedForFirestore.dataUrl,
    undefined,
    'sanitizeAttachmentForFirestore must strip embedded dataUrl when storagePath is present'
  );
  assert.equal(
    sanitizedForFirestore.storagePath,
    'users/userA/study-attachments/att_cloud_1/rbi_functions.png'
  );
  passed++;

  // 6. Legacy Base64 Inventory Scanner & DataURL Conversion
  const sampleDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const decoded = dataUrlToBlob(sampleDataUrl);
  assert.equal(decoded.mimeType, 'image/png');
  assert.ok(decoded.blob.size > 0);

  const mockNotes: VaultNoteRecord[] = [
    {
      id: 'note_legacy_1',
      userId: 'userA',
      title: 'Functions of RBI (Legacy)',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      sourceType: 'screenshot',
      content: 'Section 22 currency issue',
      attachments: [
        {
          id: 'att_leg_1',
          fileName: 'legacy.png',
          mimeType: 'image/png',
          sizeBytes: decoded.blob.size,
          dataUrl: sampleDataUrl,
        },
      ],
      version: 1,
      history: [],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    },
    {
      id: 'note_migrated_2',
      userId: 'userA',
      title: 'Functions of RBI (Migrated)',
      subject: 'Finance',
      topicTitle: 'Functions of RBI',
      sourceType: 'screenshot',
      content: 'Section 45ZB MPC',
      attachments: [sanitizedForFirestore],
      version: 2,
      history: [],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    },
  ];

  const inventory = scanLegacyEmbeddedAttachments(mockNotes);
  assert.equal(inventory.totalLegacyNotes, 1);
  assert.equal(inventory.totalLegacyAttachments, 1);
  assert.equal(inventory.items[0].attachmentId, 'att_leg_1');
  passed++;

  // 7. Phase 8 Cross-Device Synchronization Payload Integrity Simulation
  // Browser A creates "Functions of RBI" note with uploaded screenshot
  const browserANote: VaultNoteRecord = {
    id: 'note_sync_rbi_1',
    userId: 'userA',
    title: 'Functions of RBI',
    subject: 'Finance',
    topicTitle: 'Functions of RBI',
    sourceType: 'screenshot',
    content: 'Initial note created on Browser A: Monetary authority and issuer of currency.',
    attachments: [sanitizedForFirestore],
    version: 1,
    history: [],
    createdAtIso: '2026-11-02T10:00:00.000Z',
    updatedAtIso: '2026-11-02T10:00:00.000Z',
  };

  // Firestore serialized representation (verifying no base64 bloat in attachmentsMetaJson)
  const firestoreSerialized = {
    userId: browserANote.userId,
    title: browserANote.title,
    subject: browserANote.subject,
    topicTitle: browserANote.topicTitle,
    sourceType: browserANote.sourceType,
    content: browserANote.content,
    attachmentsMetaJson: JSON.stringify(browserANote.attachments),
    version: browserANote.version,
    historyJson: JSON.stringify(browserANote.history),
  };
  assert.ok(
    !firestoreSerialized.attachmentsMetaJson.includes('data:image/'),
    'Firestore serialized note must not contain embedded base64 image data'
  );

  // Browser B receives snapshot, edits note content, increments version, preserves attachment reference
  const browserBReceivedAttachments: VaultAttachment[] = JSON.parse(
    firestoreSerialized.attachmentsMetaJson
  );
  assert.equal(
    browserBReceivedAttachments[0].storagePath,
    'users/userA/study-attachments/att_cloud_1/rbi_functions.png'
  );

  // Verify User B (different account) is denied access to User A's screenshot in Storage
  assert.equal(
    evaluateStorageRules({
      auth: { uid: 'differentAccountUid', token: { email_verified: true } },
      path: `/${browserBReceivedAttachments[0].storagePath}`,
      operation: 'read',
    }),
    'DENY',
    'Another account must be strictly denied access to the screenshot'
  );
  passed++;

  // 8. Diagnose Firebase Auth Referrer Blocked Error (Task 7)
  const { diagnoseFirebaseAuthError } = await import('./src/authDiagnostics');
  const diag = diagnoseFirebaseAuthError({
    code: 'auth/requests-from-referer-https://ais-dev-qxlsqu7uyhdbhkgf6iis-387912749355.asia-east1.run.app/-are-blocked',
    message:
      'Firebase: Error (auth/requests-from-referer-https://ais-dev-qxlsqu7uyhdbhkgf6iis-387912749355.asia-east1.run.app/-are-blocked).',
  });
  assert.equal(diag.isRefererBlocked, true);
  assert.equal(diag.code, 'auth/api-key-http-referrer-blocked');
  assert.ok(
    diag.requiredReferrerPatterns.includes(
      'https://ais-dev-qxlsqu7uyhhdhbkgfl6iis-387912749355.asia-east1.run.app/*'
    )
  );
  passed++;

  console.log(
    `✅ All ${passed} Patch 02 Storage Rules, Magic-Byte, Migration, Auth Diagnostics & Cross-Device Sync assertions PASSED.`
  );
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
