# H1-Geo Launch-Candidate Report (GEO-019 update)

**Date:** GEO-019 · **Verdict:** LAUNCH CANDIDATE — ready for a *controlled,
human-operated pilot*; not ready for public launch.
Basis: 183/183 automated tests, 78/78 end-to-end regression checks
(`scripts/pilot-regression.mjs`) across all three OSM pilot regions,
Factory validators clean. **`real n = 0` genuine field measurements —
no field-accuracy claim exists.**
Acceptance bars are now explicit in `docs/PILOT_ACCEPTANCE.md`: the
controlled-pilot bar is **not yet met** (requires a human neighbor-trial
with real measurements); the public-launch bar is listed separately.

## GEO-019 update — mobile access resolved

The GEO-018 device-access blocker is addressed: `scripts/gen-dev-cert.mjs`
+ `HTTPS=1 HOST=0.0.0.0 node scripts/serve-stage-b.mjs` now serve the pilot
over HTTPS on the LAN with a locally trusted dev certificate — phone GPS
works in a secure context without tunnels or disabled browser security.
Setup: `docs/MOBILE_PILOT_SETUP.md`. Physical device confirmation remains
BLOCKED until a person performs it.

## Functionality demonstrated

Complete loop verified end-to-end (synthetic, through the real stores):
pin → real-OSM candidate assessment → destination confirmation (with
preserved device evidence + correction history) → observation → evidence
links → opportunity draft → VNN-intake readiness → named approval →
handoff package (SHA-256 verified) → local export record → backup →
restore → re-verify. A "Pilot run" panel walks an operator through the
same sections with ticks computed from saved state, not clicks.

## Actual field measurements collected

**Zero genuine measurements.** The dashboard reports `real n = 0` and
"insufficient evidence" as designed. Only simulated records exist.
Until a human runs `docs/FIELD_TRIAL_CHECKLIST.md` +
`docs/OPERATOR_GUIDE.md` against real properties, every accuracy number
in this repo is a software property, not a field result.

## Geographic coverage limitations

- OSM pilot extracts: Summerhill Atlanta US (58 buildings, 62% addr-tags),
  Libertad Tijuana MX (417 buildings, **0% addr-tags**), San José centro CR
  (114 buildings, 90% addr-tags). Outside these bboxes: `no_source_data`.
- Footprints are candidate evidence — never parcels, addresses, ownership.
- Natural Earth 1:110m country boundaries only (~110m uncertainty).
- No geocoder, no cadastral layer, no live external service.

## Property ambiguity and correction behavior

Regression measured honestly: point-in-footprint → `inside_footprint`;
dense overlap → `ambiguous` (dominant in Tijuana); outside coverage →
`no_source_data` — never guessed. Correction preserves the original
device fix and records `movedMeters` + history. Nudge buttons (~1.5m)
and draggable destination pin work on desktop and mobile widths.

## Mobile usability

Narrow-screen layout (≤760px) stacks map/sidebar, ≥40px touch targets.
**Real-device verification: BLOCKED** until a person performs it — the
access path is now solved (GEO-019): a self-signed LAN HTTPS cert makes
the phone origin secure so geolocation works legitimately. Steps in
`docs/MOBILE_PILOT_SETUP.md`. The former workarounds (insecure-origin
flag, tunnels) are superseded and no longer needed.

## Remaining blockers to a controlled pilot

1. Zero real measurements — must run the checklist/guide for real.
2. Real-device geolocation path exists (LAN HTTPS dev cert) but is
   unverified on an actual phone — BLOCKED pending a person.
3. No operator has yet rehearsed the full loop on a phone.
4. Consent/privacy steps in the guide are documented but unexercised.

## Remaining blockers to public launch

1. All controlled-pilot blockers, plus measured accuracy at adequate n.
2. Tijuana-class coverage gaps (0% address tags) need a data answer or
   an explicit product decision.
3. No real user has used it; no security/privacy review of the LAN/HTTPS
   path; no multi-operator or multi-device evidence.
4. VNN intake contract remains dry-run only by design — integration is a
   separate, explicit decision.
