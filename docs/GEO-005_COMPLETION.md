# GEO-005 — Geographic Evidence Integration: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-005 changes uncommitted on `foundation/geo-002-plumbing` (base commit `08ef0a7`) for review. GEO-003/004 checkpoint was committed and pushed as `08ef0a7` under step 1 of this mission.

## Reused contracts inspected before writing code
- `H1-SnapNTalk/src/service.ts`, `src/integrity/hashing.ts` — id vocabulary is `{prefix}_{randomUUID()}`: `cap_*` captures, `pkg_*` packages, `art_`, `ack_`, `sug_`, `del_`, `evt_`.
- `H1-SnapNTalk/contracts/capture-core-v1.schema.json`, `package-v1.schema.json` — capture/package record shapes; `privacy.locationAuthorized` gates location disclosure (Geo holds coordinates, not captures).
- `H1-HomeVault/contracts/snapntalk/capture-v1.schema.json` — `evidenceReferences` vocabulary: `{kind: "document"|"content", reference}` items, with `content://sha256/...` content refs.
- `H1-VNN/PROVENANCE.md`, `products/h1_vnn/server/` — provenance discipline and `location` free-text ≤300 intake field; fail-closed persistence doctrine.
- `H1-Geo` Stage A validator + Stage B slice — reused directly; no rebuild.

## What GEO-005 adds
Typed evidence links as first-class draft records. Flow delivered locally: select location → save assertion → create observation → attach evidence reference(s) to the pin *or* a specific observation → save → reopen → candidate dry-run payload now carries `evidenceRefs`.

| Path | Change |
|---|---|
| `src/stage-b/evidence.js` | New. `h1-geo/evidence-link-v0` record: `{targetType, targetId, kind, reference, note?, addedAt}` with format-checked references per kind |
| `src/stage-b/evidence-store.js` | New. Validated store + **target-existence guard** (links to nonexistent records rejected) + `linksForAssertionTree` |
| `src/stage-b/vnn-dryrun.js` | `evidenceRefs: [{kind, reference}]` in payload; validator requires array, rejects malformed entries |
| `src/stage-b/app.js` | Evidence UI wiring, target selector (pin + its observations), store health check includes evidence store |
| `web/stage-b/index.html` | "Evidence references" fieldset (kind select, reference, note) |
| `test/stage-b/evidence.test.js` | 9 new tests |

Evidence kinds (existing H1 vocabulary, not invented): `snapntalk_capture` → `cap_<uuid>`, `snapntalk_package` → `pkg_<uuid>`, `content` → `content://sha256/<64-hex>`, `document` → HomeVault document id. Links store **references only** — no media bytes, paths, or capture content; SnapN'Talk keeps capture authority, HomeVault keeps document/property authority, VNN keeps mission authority, no C2PA infrastructure duplicated.

## Test results
- `npm test` → **44/44 pass, 0 fail** (35 prior + 9 new).
- New coverage: each kind valid/invalid shapes, cross-kind mismatches (cap_ as package rejected), dangling-target rejection, observation-level links, reload persistence + tree resolution, corrupted-store quarantine, honest missing-evidence (`evidenceRefs: []` valid), payload carries refs with no `data:`/media content, malformed payload entries rejected.
- Factory validators (read-only, scratch copy, Factory unmodified): `01_syntax`, `02_constitutional`, `04_security` all **PASS** (only benign warning: `delete` on in-memory map in record-store).

## Demonstration
```sh
npm run stage-b   # http://127.0.0.1:8734/stage-b
```
Pin a location → Save assertion → select it in "Saved assertions" → add an observation → in "Evidence references", choose a target, a kind, and enter e.g. `cap_123e4567-e89b-42d3-a456-426614174000` → Link evidence → create candidate → dry-run payload preview shows `evidenceRefs`. Refresh the browser — everything persists.

## Boundaries and limitations
- References are validated by format, not resolved against live SnapN'Talk/HomeVault stores — read-side verification of a reference is a future adapter step with its own gate.
- `observation.evidenceRef` (free-text, from Stage B) remains accepted for backward compatibility but the UI no longer exposes it; typed links are the GEO-005 path.
- No writes outside `h1geo.stageb.*` localStorage keys; no production/remote calls; other repositories untouched.
- Boundary evidence: `git status` shows only intended paths; scratch validator area removed after use.
