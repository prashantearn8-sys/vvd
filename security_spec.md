# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Global Default-Deny**: All paths not explicitly matched (`/{document=**}`) deny all `read` and `write` operations (`if false`).
2. **Identity & Ownership Invariant**: A `UserProfile` at `/users/{userId}`, `UserPrivateInfo` at `/users/{userId}/private/{infoId}`, and `UserSignature` at `/users/{userId}/signatures/{signatureId}` can only be read, created, updated, or deleted when `request.auth != null`, `request.auth.uid == userId`, and `data.uid == request.auth.uid`.
3. **Verified Email Requirement**: All mutating operations (`create`, `update`, `delete`) require `request.auth.token.email_verified == true`.
4. **PII Isolation Invariant (Split Collection)**: User email addresses (`email`) are strictly isolated inside `/users/{userId}/private/{infoId}` and never stored on `/users/{userId}` or `/users/{userId}/signatures/{signatureId}`.
5. **Master Gate Relational Invariant**: Subcollection documents under `/users/{userId}/private/{infoId}` and `/users/{userId}/signatures/{signatureId}` cannot exist or be mutated without a valid parent `/users/{userId}` document owned by `request.auth.uid`.
6. **Secure List Query Enforcer**: `allow list` on `/users/{userId}/signatures/{signatureId}` enforces `isSignedIn() && isOwner(userId) && resource.data.uid == request.auth.uid` without `get()`/`exists()` inside `list`.
7. **Temporal Integrity & Immutability**: `createdAt` and `updatedAt` must equal `request.time` on creation; `uid`, `sigId`, and `createdAt` are strictly immutable on update, while `updatedAt` must equal `request.time`.
8. **Strict Schema & Volumetric Bounds**: Every string field enforces explicit `.size()` bounds and regex pattern checks matching `firebase-blueprint.json`. No unlisted or shadow keys are permitted (`hasAll` + `hasOnly` + `affectedKeys().hasOnly()`).

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Unauthenticated Write)**: `auth = null`, attempting `create` on `/users/user_123`.
2. **Payload 2 (Unverified Email Spoof)**: `auth = { uid: "user_123", token: { email: "victim@example.com", email_verified: false } }`, attempting `create` on `/users/user_123`.
3. **Payload 3 (Cross-User Identity Spoofing)**: `auth = { uid: "attacker_1", email_verified: true }`, attempting `create` on `/users/victim_1` with `{ uid: "victim_1", ... }`.
4. **Payload 4 (UID Field Mismatch)**: `auth = { uid: "user_123", email_verified: true }`, attempting `create` on `/users/user_123` with `{ uid: "other_uid", ... }`.
5. **Payload 5 (Shadow / Ghost Field Injection)**: Attempting `create` on `/users/user_123` with extra field `{ isAdmin: true }`.
6. **Payload 6 (ID Poisoning Attack)**: Attempting `create` on `/users/bad$id!@#` with invalid characters in `userId`.
7. **Payload 7 (Denial-of-Wallet Oversized String)**: Attempting `create` on `/users/user_123` with a 5,000-character `displayName` (exceeding `maxLength: 100`).
8. **Payload 8 (Client Timestamp Forgery)**: Attempting `create` on `/users/user_123` with a forged past/future `createdAt` instead of `request.time`.
9. **Payload 9 (Immortal Field Mutation)**: Attempting `update` on `/users/user_123` that alters `createdAt` or `uid`.
10. **Payload 10 (Value Poisoning on Update)**: Attempting `update` on `/users/user_123` setting `favoriteTools` to a number `12345` or string > 500 chars.
11. **Payload 11 (Cross-User Signature Read/Write)**: Authenticated user `attacker_1` attempting `create` or `get` on `/users/victim_1/signatures/sig_1`.
12. **Payload 12 (Orphaned Subcollection Signature Write)**: Attempting `create` on `/users/user_123/signatures/sig_1` when parent `/users/user_123` does not exist.

## 3. Red Team Conflict Report

- **Identity Spoofing**: Blocked by `isOwner(userId)` AND `data.uid == request.auth.uid` AND `incoming().uid == existing().uid`.
- **State Shortcutting**: All updates are gated by explicit action allowlists (`affectedKeys().hasOnly(...)`).
- **Resource Poisoning**: Blocked by `isValidId(userId)`, `isValidId(infoId)`, `isValidId(signatureId)`, and `.size()` caps on every string field (`dataUrl <= 250000`).
- **Value Poisoning**: Blocked because `isValidUserProfile(incoming())`, `isValidUserPrivateInfo(incoming())`, and `isValidUserSignature(incoming())` wrap the entire `allow update` expression.
