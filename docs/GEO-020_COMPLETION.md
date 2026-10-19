# GEO-020 — First Real Mobile Field Pilot

**Status:** complete — uncommitted for review.
**Builds on:** GEO-019 (`ae9bbbf` — LAN HTTPS dev pilot).

## Step 1 — GEO-019 checkpoint

Verified 183/183 tests + 78/78 regression, committed `ae9bbbf`, pushed.
`main` untouched.

## A. Secure phone access — verified machine-side

- Actual LAN IP determined from the OS: `172.20.17.239` (Wi-Fi).
- The GEO-019 cert covered loopback only — **regenerated** with
  `gen-dev-cert.mjs 172.20.17.239 --force`; SANs now include the LAN IP.
- HTTPS listener bound `0.0.0.0:8734`; `curl -k` to the LAN IP → 200.
- No explicit inbound firewall rule exists for 8734 — documented as a
  may-need operator step (Windows prompts on first bind).
- `src/stage-b/lan-check.js` + `scripts/verify-mobile-access.mjs`:
  reusable pre-session verifier (LAN IPs vs cert SANs vs listener URL →
  exact operator instructions, exit 1 if the cert doesn't cover the LAN).
- Phone-side access expressly NOT claimed — a LAN self-request proves
  the listener, not a phone.

## B. Field trial — BLOCKED

No physical device or operator exists in this environment.
`docs/FIELD_TRIAL_RECORD.md` records the verified machine state, the
exact remaining operator actions (serve → install cert → open URL →
neighbor-trial protocol → report back), an empty fill-in log, and the
honest position: `real n = 0`, nothing fabricated.

## C. Full experience validation

Automated: 5 lan-check tests + the existing pilot-run/e2e/acquisition/
backup suites cover the full logical flow. The phone-executed checklist
(open → permission → readings → identify → correct → observe → draft →
review → recover) is enumerated in the field record as operator steps,
not marked done. No software defects surfaced (none reproducible
machine-side).

## D. Field evidence and launch decision

- Actual field sample count: **0 real** (simulated records only).
- Location errors / correction effort / coverage: measured only in
  synthetic regression — reported as software properties, not field
  accuracy.
- `docs/LAUNCH_CANDIDATE.md` updated: machine-side access verified,
  trial BLOCKED, controlled-pilot bar unmet.

## E. Verification

- `npm test`: **188/188** (+5 lan-check).
- `node scripts/pilot-regression.mjs`: **78/78**.
- `node scripts/verify-mobile-access.mjs`: PASS on this machine.
- `node --check` / `git diff --check` clean.
- Factory validators: syntax / constitutional / security **PASS**
  (known-benign warnings only).

## Files

New: `src/stage-b/lan-check.js`, `scripts/verify-mobile-access.mjs`,
`test/stage-b/lan-check.test.js`, `docs/FIELD_TRIAL_RECORD.md`,
`docs/GEO-020_COMPLETION.md`.
Modified: `docs/LAUNCH_CANDIDATE.md` (GEO-020 status).
Untracked local material: `dev-cert/` regenerated for the LAN IP
(gitignored, as designed).

No deployment, other-repo changes, live VNN submissions, or merge.
