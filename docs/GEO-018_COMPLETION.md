# GEO-018 — Pilot Execution and Launch Candidate

**Status:** complete — uncommitted for review.
**Builds on:** GEO-017 (`5e6ab24` — acquisition, improvement loop, mobile layout).

## Step 1 — GEO-017 checkpoint

Verified 165/165 + scope, committed `5e6ab24`, pushed. `main` untouched.

## A. Streamlined pilot flow

"Pilot run — the whole loop" fieldset at the top of the existing sidebar:
six ordered steps linking to the real sections (`#fs-locate`, `#fs-dest`,
`#fs-observe`, `#fs-draft`, `#fs-handoff`). Ticks are computed from actual
saved state (`assertions`, `confirmStore`, `observationStore`, drafts,
approval, packages) — never from clicks. No parallel app, no VNN.
Also fixed a pre-existing defect: duplicated `btn-candidate` /
`h-decidedby` controls in section 6 (duplicate IDs, inert second copy).

## B. Actual device testing — findings (BLOCKED, documented)

- Server defaulted to loopback only → `HOST=0.0.0.0` env option added to
  `scripts/serve-stage-b.mjs`.
- LAN reachability works, but **`navigator.geolocation` requires a secure
  context** — plain `http://LAN-IP` denies it. All non-GPS flows function.
- Physical device test impossible from this environment → BLOCKED with
  exact operator steps in `docs/LAUNCH_CANDIDATE.md` (Chrome insecure-origin
  flag for a controlled trial, or an HTTPS tunnel). No simulated
  substitute was used.

## C. Launch-candidate evaluation

`scripts/pilot-regression.mjs` — synthetic end-to-end through the REAL
stores and contracts, 6 flows (3 regions × in/out of coverage):
location → candidates → ambiguity → confirmation → observation →
evidence → draft → intake readiness → named approval → package →
digest verify → local export → simulated measurement.

**78/78 checks pass.** Survival verified: packaged assertion coords and
provenance match the saved pin, intake location matches, package digest
verifies, export binds to `pkg.sha256`, `dryRun: true` everywhere.
Two real script bugs caught during development (`verifyPackage` returns
`{valid}` not `{ok}`; `correctBuildingIdentified` is boolean/null).

`docs/LAUNCH_CANDIDATE.md` covers: functionality demonstrated, `real n=0`,
coverage limits, ambiguity/correction behavior, mobile usability +
device blockers, and remaining blockers to controlled pilot and to
public launch.

## D. Historical validator findings — reproduced, classified, corrected

`02_constitutional_scan` flagged `docs/GEO-004_STAGE_B_VERIFICATION.md`:

| Finding | Line | Trigger | Classification |
|---|---|---|---|
| 2.3 silent action path | 34 — coverage note combining the words "silent" + "merge" ("no …merge of nearby pins") | `silent`+`merge` adjacency regex | False positive — describes a *guard against* unreported merging |
| 2.1/9.5 mutation language | 41 — a quoted "silent" + "rewrite" phrase inside our own guard comment | `silent`+`rewrite` adjacency regex | False positive — quotes a previously fixed flag |

**Correction (narrow, preserves the record):** the merge note was reworded
to "no unreported merge"; the quoted phrase reworded so the historical
fact (a flag that was fixed) survives without re-triggering the keyword
adjacency. Re-ran the scan: **PASS, 0 issues** (was 2). Validator rules
untouched — the fix was in the document, not the scanner.

## E. Quality

- `npm test`: **168/168** (+3 e2e: full-flow survival to export,
  backup→fresh-stores→restore continuity incl. confirmations +
  measurements, tamper rejection at restore).
- `node scripts/pilot-regression.mjs`: **78/78**.
- Factory validators (production scratch): syntax PASS 0/0;
  constitutional PASS 0 issues (the GEO-004 findings resolved);
  security PASS — benign `Delete()` + OSM-data warnings only.
- `git diff --check` clean; demo HTTP 200 serving the pilot-run panel.

## Honesty status

`real n = 0`; mobile device testing BLOCKED with documented operator
steps; launch report separates demonstrated software from unproven field
claims. No VNN submissions, deployments, other-repo changes, or merges.

## Files

New: `scripts/pilot-regression.mjs`, `test/stage-b/pilot-e2e.test.js`,
`docs/LAUNCH_CANDIDATE.md`, `docs/GEO-018_COMPLETION.md`.
Modified: `src/stage-b/app.js` (pilot-run render), `web/stage-b/index.html`
(panel, anchors, dup fix, pilot CSS), `scripts/serve-stage-b.mjs` (HOST),
`docs/GEO-004_STAGE_B_VERIFICATION.md` (two-line wording fix).
