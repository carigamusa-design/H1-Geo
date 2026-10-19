# H1-Geo Launch-Candidate Report (GEO-018)

**Date:** GEO-018 · **Verdict:** LAUNCH CANDIDATE — ready for a *controlled,
human-operated pilot*; not ready for public launch.
Basis: 168/168 automated tests, 78/78 end-to-end regression checks
(`scripts/pilot-regression.mjs`) across all three OSM pilot regions,
Factory validators clean. **`real n = 0` genuine field measurements —
no field-accuracy claim exists.**

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
**Real-device verification: BLOCKED** — see below.

### Real-device access — findings

- The demo server binds `127.0.0.1` by default. `HOST=0.0.0.0
  node scripts/serve-stage-b.mjs` now exposes it on the LAN.
- A phone on the same Wi-Fi can then open `http://<lan-ip>:8734/stage-b`.
- **Geolocation will still be denied**: browsers only allow
  `navigator.geolocation` in secure contexts; `http://LAN-IP` is not one.
  Manual pins, candidate confirmation, and all local workflows function —
  only device GPS and the multi-reading acquisition are unavailable.
- Exact operator steps for a real-device trial:
  1. `HOST=0.0.0.0 node scripts/serve-stage-b.mjs`
  2. On the phone: Chrome → `chrome://flags` →
     "Insecure origins treated as secure" → add `http://<lan-ip>:8734`
     (developer flag; acceptable for a controlled trial), **or**
     tunnel the port (`ssh -R`, `ngrok`, `cloudflared`) so the phone
     sees an `https://` origin.
  3. Grant location permission, then follow `docs/OPERATOR_GUIDE.md`.
- Physical device testing could not be performed from this execution
  environment — marked BLOCKED, not simulated.

## Remaining blockers to a controlled pilot

1. Zero real measurements — must run the checklist/guide for real.
2. Real-device geolocation requires the HTTPS/secure-context workaround above.
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
