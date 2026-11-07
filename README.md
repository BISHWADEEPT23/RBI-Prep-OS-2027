# RBI Prep OS 2027 — Personal Study Command Center (v5.0 Local-First Hybrid Edition)

**RBI Prep OS 2027** is a Local-First Hybrid Study Operating System designed for working professionals preparing for the **RBI Grade B / Grade A 2027** examination alongside the Anuj Jindal learning platform.

---

## 1. Local-First Hybrid Architecture Overview

### Mode 1 — Local Workspace Mode (Default on Launch)
- **Zero Sign-In Required**: Launches directly into the full study workspace without Google Sign-In, Firebase connectivity, or continuous internet access.
- **Primary Source of Truth**: All study records are stored in the versioned local IndexedDB database `rbi_prep_os_2027` (`LOCAL_DB_VERSION = 2`) across 19 indexed object stores.
- **Binary Attachment Storage**: Screenshots (`PNG`, `JPEG`, `WebP`) and `PDF` handouts (up to 10 MB per file) are validated via magic-byte header inspection, hashed with `SHA-256`, and stored as binary `Blob` objects in `attachmentBlobs` + `attachments`. Base64 strings are never permanently stored in note or session documents.
- **Complete ZIP Backup & Validated Restore**: Export a single `.zip` archive containing `workspace_database.json`, `manifest.json` (with SHA-256 checksums), and all binary attachments under `attachments/{attachmentId}/{safeFilename}`. Restore supports pre-restore inspection, SHA-256 verification, and **Merge** vs. **Replace** modes with automatic rollback on failure.

### Mode 2 — AI-Enhanced Local Mode (Online, No Google Sign-In Required)
- When the Express server is reachable and `GEMINI_API_KEY` is configured on the server, `/api/ai/session-token` issues a short-lived (15-minute), HMAC-SHA256 signed Local Workspace AI Session Token bound to `X-Workspace-Id`.
- Rate limiting (`10 req/min`) and daily spending protection (`120 req/24h` per workspace/IP) protect all `/api/ai/*` endpoints.
- If the user is offline or Gemini is unavailable, Screenshot-to-Notes automatically provides manual transcription + structured note templates, and the Practice Quiz Engine automatically uses the bundled local IndexedDB question bank.

### Mode 3 — Optional Cloud Sync Mode (Firebase Firestore & Storage)
- Users who want cross-device synchronization can opt into **Cloud Sync** in **Settings &rarr; Account & Data Synchronization** after reviewing the pre-sync inventory, exporting a pre-sync ZIP backup, and granting explicit consent.

---

## 2. Automated Verification Commands

```bash
# 1. Run the 24 Local-First Hybrid OS automated tests (L01 through L24)
npx tsx local_first_v5.test.ts

# 2. Run the 12 Firebase Storage & Security rule verification tests (T01 through T12)
npx tsx storage.rules.test.ts

# 3. Run TypeScript static analysis
npm run lint

# 4. Run production Vite + PWA bundle build
npm run build
```

---

## 3. Google Cloud Run & Firebase Security Configuration

### 3.1 Secret Manager Setup (`GEMINI_API_KEY`)

```bash
# Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant the default Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3.2 Firestore Security Rules (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 3.3 Cloud Run Deployment & Verification Binding

```bash
gcloud run deploy rbi-prep-os-2027 \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"

gcloud run services update rbi-prep-os-2027 \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=asia-east1
```
