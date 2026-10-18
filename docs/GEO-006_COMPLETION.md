# GEO-006 — Geographic Opportunity Workflow: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-006 changes uncommitted on `foundation/geo-002-plumbing` (base `11f5f21`) for review. GEO-005 was committed and pushed as `11f5f21` under step 1 of this mission (44/44 tests confirmed green before commit).

## Flow delivered (local, non-production)
Select a saved assertion → review its observations and evidence links → create/edit an opportunity draft (condition, proposed work, VNN intake fields) → save → reopen with geographic and evidence relationships intact → preview the exact VNN-shaped handoff payload with an honest missing-information list. No live mission submission; `dryRun: true` is enforced by the payload validator.

## VNN contract reuse (inspected before coding)
`H1-VNN/products/h1_vnn/server/intake_store.py` is the actual intake authority. The draft and payload mirror its vocabulary exactly:
- Field set: `title, outcome, required_capabilities, location, requested_timing, evidence_requirements, offered_amount, currency, amount_certainty` (VNN `_FIELD_ORDER`/`EDITABLE_FIELDS`).
- Length limits: `title≤300, outcome≤5000, location≤300, requested_timing≤300, evidence_requirements≤2000` (VNN `_FIELD_MAX_LEN`).
- Missing-info logic mirrors VNN's questioner: location/outcome/timing/capabilities prompt when absent; currency required when an amount is offered.
- Attachments are references only, kinds restricted to VNN `ATTACHMENT_KINDS` {photo, video, document, other}; Geo evidence kinds map conservatively (document/content→document, snapntalk_*→other since media type isn't knowable here).
- Doctrine mirrored: absent values are explicit nulls, never silently missing keys; intake states stay ahead of anything Geo sends (our draft ≠ VNN MISSION_CREATED).

## Paths changed
| Path | Change |
|---|---|
| `src/stage-b/candidate.js` | Draft fields added: title, condition, proposedWork, requestedTiming, requiredCapabilities, evidenceRequirements, offeredAmount, currency, amountCertainty — all optional, all validated |
| `src/stage-b/candidate-store.js` | New: candidate store with relationship guard (assertionId/observationId can't be rewired by an edit) |
| `src/stage-b/vnn-dryrun.js` | Rebuilt around VNN intake shape: `intake{…}` block, `assessHandoffReadiness()` returning the missing-field list, attachments from evidence links, stricter payload validator |
| `src/stage-b/app.js` | Draft form (create + edit + save), per-candidate edit button, missing-info display in preview, uses createCandidateStore |
| `web/stage-b/index.html` | Opportunity draft form fields |
| `test/stage-b/opportunity-workflow.test.js` | 9 new tests |
| `test/stage-b/vnn-dryrun.test.js` | Updated for intake payload shape |

## Verification
- `npm test` → **53/53 pass, 0 fail** (44 prior + 9 new). New coverage: draft creation, draft-field validation (lengths, capabilities array, amount/currency/certainty), edit persistence + preserved relationships, rewire rejection, reopen continuity (geographic + evidence links), exact missing-field reporting (including currency-without-amount and absent assertion → location gap), VNN intake payload shape with explicit nulls + attachments, malformed-payload rejection, corrupted-store quarantine.
- Factory validators on read-only scratch copy (Factory unmodified): `01_syntax` PASS, `02_constitutional` PASS, `04_security` PASS (one benign warning: `delete` on in-memory map).
- `git diff --check` clean; demo serving at `http://127.0.0.1:8734/stage-b` (`npm run stage-b`).

## Demonstration
Pin → save → select it → observation → evidence link → in "Opportunity draft" fill title/condition/proposed work/timing/capabilities → "Create draft" → preview shows `intake` + `missing` → "edit draft" → change fields → "Save draft" → refresh the browser → reopen: draft, links, and location intact; missing list reflects remaining gaps.

## Boundaries and limitations
- Draft is a Geo-side record: `unverified`/`needs_review` only; `verified` still requires evidence + named authority and is not exposed in the UI.
- The handoff payload is VNN-*shaped*; a real submission needs VNN-side intake endpoint + authorization review. `location` remains "lat,lng" text per VNN's current free-text field.
- Attachments carry references only; resolving them against live SnapN'Talk/HomeVault stores is a future read-side adapter gate.
- No writes outside `h1geo.stageb.*` localStorage; no other repository touched.
