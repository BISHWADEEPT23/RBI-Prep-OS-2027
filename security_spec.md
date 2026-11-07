# Security Specification — RBI Prep OS 2027 (`security_spec.md`)

## 1. Data Invariants

1. **Strict Owner Isolation (Master Gate)**:
   - Every document in `/users/{userId}` and its subcollections (`topics`, `sessions`, `tasks`, `notes`, `quizzes`, `revisions`, `currentAffairs`, `interactions`) belongs exclusively to `userId`.
   - `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId` must hold for all reads and writes.
   - Subcollection items require parent `/users/$(userId)` document existence via `exists(/databases/$(database)/documents/users/$(userId))` on single-document mutations (`create`, `update`, `delete`, `get`).
   - `list` queries on subcollections enforce `resource.data.userId == request.auth.uid && request.auth.uid == userId` without `get()`/`exists()` inside `allow list` to prevent O(N) cost amplification.
2. **Identity & Immutable Fields**:
   - `incoming().userId == request.auth.uid` on `create`.
   - `incoming().userId == existing().userId` and `incoming().createdAt == existing().createdAt` on `update`.
3. **Temporal Integrity**:
   - `incoming().createdAt == request.time` and `incoming().updatedAt == request.time` on `create`.
   - `incoming().updatedAt == request.time` on `update`.
4. **Volumetric & Key Allowlisting**:
   - Every document `create` validates `.keys().hasAll(...)` and `.keys().hasOnly(...)`.
   - Every document `update` validates `isValid[Entity](incoming())` and `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
   - Every string validates `is string` and `.size() <= MAX`.
   - Every path variable ID validates `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars) on single-doc operations.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Write**: `auth = null` attempting `create` on `/users/u1/topics/t1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email_verified: false } }` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
3. **Cross-User Read (PII / Study Leak)**: `auth = { uid: 'u2', token: { email_verified: true } }` attempting `get` on `/users/u1/notes/n1` -> `PERMISSION_DENIED`.
4. **Identity Spoofing in Payload**: `auth.uid = 'u1'` creating `/users/u1/topics/t1` with `{ userId: 'u2', ... }` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection on Create**: Creating `/users/u1/topics/t1` with `{ ..., isAdmin: true }` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection on Update**: Updating `/users/u1/topics/t1` with `{ ..., hackedField: 'x' }` -> `PERMISSION_DENIED`.
7. **Immutable Field Mutation**: Updating `createdAt` or `userId` on `/users/u1/sessions/s1` -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: Creating `/users/u1/tasks/tk1` with `createdAt = Timestamp(2020, 1, 1)` != `request.time` -> `PERMISSION_DENIED`.
9. **Path ID Poisoning**: Creating `/users/u1/topics/bad$id!@#` with invalid characters -> `PERMISSION_DENIED`.
10. **Value Poisoning / Oversized String (Denial of Wallet)**: Updating `/users/u1/topics/t1` with `title` length > 200 -> `PERMISSION_DENIED`.
11. **Orphan Subcollection Creation**: Creating `/users/u1/topics/t1` before parent `/users/u1` exists -> `PERMISSION_DENIED`.
12. **Unauthorized List Scraping**: Listing `/users/u1/notes` as `auth.uid = 'u2'` -> `PERMISSION_DENIED`.
