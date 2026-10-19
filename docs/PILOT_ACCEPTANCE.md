# Pilot Acceptance Criteria

Two separate bars. Meeting the **controlled-pilot** bar does NOT imply
readiness for public launch.

## Controlled pilot — measurable criteria

Each criterion has an executable check (`test/geo/acceptance.test.js` +
the e2e suite) *and* a field observation requirement.

| # | Criterion | Automated check | Field check |
|---|---|---|---|
| 1 | No automatic selection of an uncertain property — ambiguous sites present choices, never a picked candidate | `AC1` | Operator sees `multiple_plausible` on dense sites and picks deliberately |
| 2 | Correction is explicit and recorded; original evidence preserved | `AC2` (`originalPreserved` enforced) | Nudge/drag/Use all record `movedMeters`; original fix visible in record |
| 3 | No fabricated addresses or property identities | `AC3` (untagged → `OSM building #…`; tags → `unverified`) | Tijuana sites never display invented addresses |
| 4 | No handoff package without a named review approval | `AC4` + e2e decline/stale tests | Decline and stale edits block packaging |
| 5 | Reliable session recovery — all records survive refresh/restore | `pilot-e2e` backup→restore test | Reload mid-flow; nothing lost; tampered backup rejected |
| 6 | Unavailable geographic data reported honestly, never guessed | `AC5` (`no_source_data` / `none_in_range` / `insufficient_info`) | Off-coverage site shows insufficient info, not a candidate |
| 7 | Device readings reported individually — never averaged | `acquisition.test.js` anti-averaging asserts | Operator picks a real reading; stability shown honestly |
| 8 | Real and simulated measurements never mixed | dashboard split + `AC*` real-only findings | `simulated` default; real requires explicit checkbox |
| 9 | Privacy: no upload path; dev certs/git secrets never committed | `AC6` + `.gitignore` | Export is a local file; certs stay off GitHub |

A controlled pilot **passes** when all automated checks pass *and* a
human operator completes `docs/NEIGHBOR_TRIAL.md` with real measurements
recorded as `real` — currently `real n = 0`, so the pilot bar is **not
yet met**.

## Public launch — additional bar (not assessed here)

- Field-measured accuracy at adequate real n across all three regions,
  with the improvement loop reporting no unresolved recurring failure.
- Coverage strategy for zero-address areas (Tijuana-class gaps).
- Security/privacy review of the HTTPS/LAN path and any future
  deployment; real consent workflow exercised.
- VNN integration decision — the intake contract is dry-run by design.
- Multi-operator, multi-device evidence; accessibility pass.
