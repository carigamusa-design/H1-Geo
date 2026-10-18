# GEO-007 — Opportunity Review and Local Handoff: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-007 changes uncommitted on `foundation/geo-002-plumbing` (base `ae36fb1`) for review. GEO-006 committed/pushed as `ae36fb1` under step 1 (53/53 verified green first).

## What GEO-007 adds
A human review workflow over opportunity drafts: open a saved draft → see location/observations/evidence and which VNN intake fields are missing → correct the draft → explicitly approve or decline → an approved decision generates a stable local **handoff record** bound to the exact reviewed draft version → post-approval edits mark the record **stale** and require a new review.

## Reused patterns (inspected, not rebuilt)
- VNN `intake_store.py`: missing-field questioner semantics → `assessHandoffReadiness`; `missingAtDecision` recorded on every decision.
- H1 provenance doctrine (VNN PROVENANCE, SnapN'Talk id-prefixing, Geo provenanceRef): the handoff record carries `draftFingerprint` + `decidedBy` + `decidedAt` — what was approved, by whom, when, against which draft version.
- Append-only decision history mirrors VNN's draft-revision model (new decision = new record; `update()` is disabled on the handoff store).

## New modules
| Path | Role |
|---|---|
| `src/stage-b/fingerprint.js` | Canonical JSON + FNV-1a-64 fingerprint — deterministic in Node and browser; change detector for staleness, not a security hash |
| `src/stage-b/handoff.js` | `h1-geo/handoff-record-v0` record + validator + `resolveReviewState` → `unreviewed/approved/declined/stale` |
| `src/stage-b/handoff-store.js` | Validated append-only store; save requires the referenced draft to exist |
| `src/stage-b/app.js`, `web/stage-b/index.html` | Review state line, stale banner, Approve/Decline buttons, reviewer-name input, per-draft handoff history with payload snapshots |
| `test/stage-b/handoff-review.test.js` | 10 new tests |

Handoff record: `{schemaVersion, draftId, decision: approved|declined, decidedBy, decidedAt, draftFingerprint, missingAtDecision[], payload|null}`. Approved records snapshot the exact dry-run payload reviewed; declined records carry none.

## Verification
- `npm test` → **63/63 pass, 0 fail** (53 prior + 10 new). Coverage: fingerprint determinism/order-independence, approval binding to draft version, decline-without-payload, named-reviewer + draft-existence requirements, missing fields recorded at decision, **edit→stale→re-review clears staleness**, unchanged-draft stays approved, reload persistence, append-only enforcement, corrupted-store quarantine, evidence links flowing into the approved payload.
- Factory validators (read-only scratch copy): `01_syntax` PASS, `02_constitutional` PASS, `04_security` PASS (same benign `delete` warning).
- `git diff --check` clean; demo live at `http://127.0.0.1:8734/stage-b`.

## Boundaries
- Handoff records are local reviewable artifacts (`h1geo.stageb.handoffs.v1`) — a decision ledger, not a mission engine. VNN retains all mission authority; nothing is submitted.
- Staleness compares full draft content — any field change after a decision requires re-review.
- `decidedBy` is a typed name string (local reviewer); no auth/identity integration yet — acceptable for a local slice, flagged for a later identity gate.
