# GEO-009 — Trusted Handoff & VNN Integration Readiness: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-009 changes uncommitted on `foundation/geo-002-plumbing` (base `96f0028`) for review. GEO-008 committed/pushed as `96f0028` under step 1 (71/71 verified green first).

## A. Reuse of existing H1 trust capabilities (inspected)

| Capability | Location | Status for GEO-009 |
|---|---|---|
| Ed25519 signing | `H1-Universe/products/h1_dr/server/signature.py` — `sign_hash(hash)` signs `hash.encode()`, returns hex; keys auto-generated under `server/keys/` | **CONTRACT REUSED** — Geo adapter signs the package's sha256 hex string identically, via WebCrypto Ed25519 (`crypto.subtle`). Python `cryptography` lib itself is not browser-reachable; the contract shape (Ed25519 over digest-hex-string, signature as hex) is what was reused. |
| sha256 + canonical JSON + `artifact://sha256/` refs + seal manifests + event hash chain | `H1-SnapNTalk/src/integrity/hashing.ts` | Already-mirrored semantics in `fingerprint.js`; Geo digest uses `crypto.subtle` directly (browser has no `node:crypto`). No duplication of its seal/event machinery. |
| Evidence refs = references, not proof | `H1-VNN/products/h1_vnn/server/evidence.py` | Honored: `evidenceAuthenticity` is always `"not_established"`. |
| Authorization gates | `H1-Router/src/policy_gate.py` | Not duplicated — signer authorization is a local name-match policy check. |
| Trust-Engineering | `C:/dev/H1-Trust-Engineering` | README only — no implementation to reuse. |
| C2PA | — | **Not claimed** — no C2PA infrastructure exists or is asserted. |

## B. Authenticated approval (`src/stage-b/signature.js`)

`h1-geo/handoff-signature-v0` record: `{algorithm: "Ed25519", signerId, publicKey (64-hex raw), signedHash (the package digest), signature (128-hex), signedAt}` — binds **digest + signer identity + key reference + approved content** (digest covers content, which embeds the draft fingerprint).

Four-way trust verdict (`assessTrust`) — deliberately never collapsed:
- `contentIntact` — GEO-008 digest recompute.
- `signatureValid` — Ed25519 verifies over the signed hash string.
- `signerAuthorized` — `signerId === package.content.review.decidedBy` (the signer must be the recorded approver; a stranger's valid signature fails this).
- `evidenceAuthenticity` — always `"not_established"`; references are references.

Demonstrated by tests: a tampered package keeps a *valid* signature over the claimed digest while `contentIntact` reports the tamper — a valid signature alone establishes nothing else. Missing/unsupported crypto degrades honestly (`ed25519Available()` gate in UI; tests skip-clean if absent — present on Node 24).

## C. VNN integration preparation (`src/stage-b/vnn-export.js`)

Inspected real VNN intake entry points (`intake_router.py`): `create_session` (`requester_ref` required ≤200, `home_context_type ∈ {property,project,case,life_area}`, channel ∈ `{text,voice_transcript,form,other}`), `update_draft` (fields ⊆ `EDITABLE_FIELDS`, each sanitized), `add_attachment` (`{kind ∈ {photo,video,document,other}, ref ≤1000, note}`), `confirm(revision)` bound to exact revision, `create-mission` VNN-only.

`h1-geo/vnn-intake-export-v0` record: `{packageRef{packageId,sha256}, session{SessionCreate-shaped}, draftFields{non-null ⊆ EDITABLE_FIELDS}, omittedFields[], attachments[{kind,ref,note}], signature?, readyForIntake, missing[], dryRun:true}`.

- `draftFields` ships only non-null fields — VNN's own drafts start null and `_sanitize_field` would stringify a literal null to `"None"`. Omitted fields are listed honestly.
- Geo evidence kinds map conservatively: `document`→`document`, everything else →`other` (refs pass verbatim).
- UI is preview-first: "Preview VNN export" renders the exact record, "Confirm export record" stores it locally. **Nothing POSTs to VNN**; `create-mission` remains VNN's boundary.

## D. Verification
- `npm test`: **80/80 pass** (+9: sign/verify, wrong-key & wrong-digest rejection, 4-way verdict incl. stranger-signer and unsigned cases, tamper-vs-signature separation, anonymous-signer & malformed-record rejection, export contract + bad session fields + non-editable field rejection, conservative attachment mapping, signature persistence, digest-change breaking the binding).
- Factory validators (read-only scratch, Factory unmodified): syntax / constitutional / security **PASS** (one benign `delete` warning).
- `git diff --check`: clean.

## Demonstration
`npm run stage-b` → section 8: "Generate signer key" → enter signer name (the reviewer) + requester_ref → on a generated package: "Sign package" → "Verify trust" shows the four-way verdict → "Preview VNN export" shows the exact export doc → "Confirm export record" stores it.

## Boundaries held
All local; no VNN calls, no production submission, no other-repo changes, no merges. A signature claims *the signer vouched for this package* — off-machine authority (PKI, key registration) is a separate reviewed gate, flagged in the code.
