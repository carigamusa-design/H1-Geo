# GEO-008 — VNN Handoff Package: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-008 changes uncommitted on `foundation/geo-002-plumbing` (base `20f5f2c`) for review. GEO-007 committed/pushed as `20f5f2c` under step 1 (63/63 verified green first).

## What GEO-008 adds
An exportable, tamper-evident package generated from a **currently approved** draft. Envelope: `{schemaVersion, packageId, createdAt, content, sha256}` where `sha256 = SHA-256(canonicalJson(content))` — every meaningful field lives inside `content`, so the digest covers the whole payload. Export = JSON download or copy; import = parse + full verify with zero mutation.

## VNN import/intake boundary (inspected)
- `intake_store.py` attachments table: references only ("A URI is a reference, not proof of authenticity") — our `intake.attachments` match that.
- No package-import contract exists on the VNN side; the package is a Geo-side artifact carrying a VNN-*shaped* intake draft. A real submission boundary is a separate reviewed gate — flagged, not designed here.

## Package content (digested)
`generator, draftId, review{decidedBy, decidedAt, draftFingerprint, missingAtDecision}, intake{…VNN fields}, readyForIntake, missing[], assertion (full contract record), assertionId, observationId, evidenceRefs[], candidateStatus, provenanceRef, dryRun:true`. Envelope: `{schemaVersion: "h1-geo/vnn-handoff-package-v0", packageId: hop_<uuid>, createdAt, content, sha256}` where `sha256 = SHA-256(canonicalJson(content))` via `crypto.subtle` (same call in Node ≥19 and browsers).

## Gates honored
- Requires a **current approved** review: unreviewed / declined / **stale** drafts all rejected with reasons.
- Readiness distinguished, not hidden: `readyForIntake` + `missing[]` in the digested content.
- Verify path (`verifyPackage`/`importAndVerifyPackage`): structure → recompute SHA-256 over `canonicalJson(content)` → internal consistency (assertion is a valid coordinate assertion; `intake.location` must equal packaged coords; `provenanceRef` must match assertion) → relationship checks against live stores (draft/assertion still present). Never mutates what it imports.
- `PACKAGE_STORE_KEY` persists generated packages via the same validated/quarantining record store.

## Tests (8 new, 71 total)
- `npm test` → **71/71 pass** — packaging success + digest verify, reject unreviewed/declined/stale, readiness flagging, export→import round trip, tamper → digest mismatch, malformed JSON + unsupported version rejection, broken-relationship detection against empty stores, package persistence.
- Factory validators: PASS (details above).

## Demonstration
`npm run stage-b` → pin → save → observation → evidence link → draft → type a reviewer name → "Approve handoff" → "Generate handoff package" → package card shows `packageId`, `ready=…`, sha256 prefix; "Export package JSON" downloads the file. Paste any package JSON into "Import handoff package" → "Verify package" → verdict reports digest validity + readiness or the specific rejection.

## Limitations
- Import verifies integrity/consistency, not authority — the package claims "draft X was approved by Y"; trusting that claim off-machine needs a signature (explicitly out of scope; VNN's own provenance model is the pattern to follow when real submission is designed).
- Packages persist locally; no pruning policy (scratch store).
