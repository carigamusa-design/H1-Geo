# GEO-019 — Secure Mobile Pilot and Real-World Validation

**Status:** complete — uncommitted for review.
**Builds on:** GEO-018 (`43ed2b5` — pilot-run flow, launch candidate, e2e regression).

## Step 1 — GEO-018 checkpoint

Verified 168/168 tests + 78/78 regression, committed `43ed2b5`, pushed.
`main` untouched.

## A. Secure mobile access — implemented and verified

- `src/stage-b/serve-config.js` — pure resolver: host/port/HTTPS from env,
  secure-context consequence reported honestly (`geolocation: available` |
  `denied (insecure origin)`), fail-closed on missing cert files.
- `scripts/gen-dev-cert.mjs` — openssl wrapper: `node scripts/gen-dev-cert.mjs
  <lan-ip>` writes `dev-cert/{key,cert}.pem` with SANs `localhost/127.0.0.1/
  ::1/<lan-ip>`; refuses overwrite without `--force`; exits with guidance if
  openssl is absent.
- `scripts/serve-stage-b.mjs` — rewritten around the resolver; `HTTPS=1`
  serves with node:https, prints origin + geolocation status.
- `dev-cert/` gitignored; key material verified untracked.
- **Verified live:** generated a real cert, served
  `https://127.0.0.1:8734/stage-b` → HTTP 200, `geolocation: available`.
- No tunnels, no deployment, no disabled browser security. Instructions in
  `docs/MOBILE_PILOT_SETUP.md` (Windows + Android/iOS trust steps).

## B. Complete mobile workflow

Automated what's testable: serve-config (5 tests), pilot-run step model
extracted to `src/stage-b/pilot-run.js` and covered (3 tests — progression,
stale-review gating, no order-skipping), plus the existing e2e/backup
continuity tests. **Physical device verification remains BLOCKED** —
documented in the setup and launch docs; a person must perform it. No
simulated substitute was claimed.

## C. Field accuracy trial

`docs/NEIGHBOR_TRIAL.md` — a repeatable protocol targeting the worst
failure (wrong neighboring property): adjacent pairs in Summerhill,
Tijuana zero-address density, San José tagged international; the
independence rule (reference established *without the app*); ≥10 sites /
≥2 sessions; consent and privacy; what the dashboard/improvement loop
will and won't say. Uses existing 3b/3c/3d capabilities. Zero invented
measurements — `real n` is still honestly 0.

## D. Pilot acceptance criteria

`docs/PILOT_ACCEPTANCE.md` — nine measurable controlled-pilot criteria
(no auto-selection, explicit recorded correction, preserved GPS, no
fabricated addresses, review-gated handoff, session recovery, honest
coverage handling, unaveraged readings, real/simulated separation,
privacy) each with an automated check **and** a field check; public-launch
bar kept separate. `test/geo/acceptance.test.js` encodes AC1–AC6.

## E. Verification

- `npm test`: **183/183** (+15: serve-config 5, pilot-run 3, acceptance 6,
  plus the GEO-018 pilot-e2e suite).
- `node scripts/pilot-regression.mjs`: **78/78**.
- `node --check` clean on all edited/new files.
- `git diff --check` clean; `git check-ignore` confirms `dev-cert/`.
- HTTPS serve verified live (HTTP 200, secure origin).
- Factory validators: see below.

## Files

New: `src/stage-b/serve-config.js`, `src/stage-b/pilot-run.js`,
`scripts/gen-dev-cert.mjs`, `docs/MOBILE_PILOT_SETUP.md`,
`docs/NEIGHBOR_TRIAL.md`, `docs/PILOT_ACCEPTANCE.md`,
`test/stage-b/serve-config.test.js`, `test/stage-b/pilot-run.test.js`,
`test/geo/acceptance.test.js`, `docs/GEO-019_COMPLETION.md`.
Modified: `scripts/serve-stage-b.mjs` (config-driven, HTTPS),
`src/stage-b/app.js` (imports extracted pilot-run module),
`.gitignore` (dev-cert), `docs/LAUNCH_CANDIDATE.md` (status update).

No deployment, other-repo changes, live VNN submissions, or merge into main.
