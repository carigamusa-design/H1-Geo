# GEO-011 — Real-World Pilot Readiness: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-011 changes uncommitted on `foundation/geo-002-plumbing` (base `a4b6b93`) for review. GEO-010 committed/pushed as `a4b6b93` under step 1 (86/86 verified green first).

## A. Real observations vs. synthetic
- `isSyntheticRecord()` (`workflow.js`) detects loader-created records via the `h1geo://example/` provenance prefix or a `SYNTHETIC` tag in text fields — no schema change needed (the assertion contract rejects extra properties).
- Every pin in the list is tagged `[real]` or `[SYNTHETIC]`; drafts carry the same tag in the overview. Manual entry paths are untouched — real observations save exactly as before with full validation/provenance.

## B. Operational usability
- Pin list: free-text filter over source/coords/provenance/notes.
- New "9. Drafts overview": every draft across all locations in one list — location coords, review state, missing intake fields, evidence count, packaged/signed/exported badges — filterable by review state, evidence completeness, location scope (all vs. selected pin), and free text. Clicking a row opens its location.

## C. Pilot continuity — `src/stage-b/backup.js`
Reuse survey: **no existing H1 backup engine** — SnapN'Talk `package-v1` is an evidence package, HomeVault legacy-intake is an import archive, VNN stores intake server-side. Documented; bounded local equivalent built.

`h1-geo/working-records-backup-v0`: `{createdAt, recordCounts, records{8 stores: [{id, record}]}, sha256}` — digest over canonical JSON, same idiom as GEO-008 packages.

- `validateBackup`: structure → digest recompute → per-record contract validation → **referential integrity** (obs→assertion, candidate→assertion+observation, evidence→typed target, handoff→draft, package→draft, signature→package digest, export→package digest, duplicate-id check).
- `restoreBackup`: re-validates then replaces — parents before dependents so relationship guards pass. Handoff ids regenerate (append-only store; contents + order preserved; nothing references handoff ids).
- UI: "Download backup" (JSON file), "Validate backup" (counts or errors), "Restore" behind an explicit `confirm()`. Nothing is written if validation fails.

## D. Pilot evidence
`docs/PILOT_CHECKLIST.md` — honest split: demonstrated-locally items checked; real-user items explicitly unchecked; limitations listed. No claim of real-world activity.

## E. Verification
- `npm test`: **93/93 pass** (+7: synthetic-vs-real marking, multi-location filtering, backup create/validate, restore preserving ids+relationships, tamper/bad-record/dangling/version/JSON rejection, no-write-on-failure, full chain package+signature+export restore).
- Factory validators (read-only scratch): syntax / constitutional / security **PASS** (one benign `delete` warning).
- `git diff --check` clean; demo at `127.0.0.1:8734/stage-b`.

## Boundaries held
All local; no live VNN submissions, no deploys, no other-repo changes, no merges. GEO-011 files uncommitted for review.
