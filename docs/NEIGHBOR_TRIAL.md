# Neighboring-Property Trial — the field test that matters most

The most important measured failure is **picking the wrong neighboring
property**. This is a small, repeatable protocol to measure it for real.
Companion to `docs/OPERATOR_GUIDE.md` (conduct) and
`docs/FIELD_TRIAL_CHECKLIST.md` (steps). **Never manufacture results.**

## What you're measuring

For each site: did the system present the correct building as a
candidate, and did the operator end on it — or an adjacent one?
Record, per site (section 3c):

- device position + reported accuracy (use "Collect 5 readings")
- the independently established reference (rule below)
- correct-building identified? (`yes`/`no`/`unknown`)
- correction needed? (checkbox)
- ambiguity verdict at the site (shown live in 3b; stored on the record)

The 3d dashboard computes the rates — you only record observations.

## The independence rule (hard requirement)

The reference destination must be established **without using the app**:
you are standing at the property and know which building it is (address
on the building, owner present, prior knowledge). If you can't
independently say "this is the intended property," the site doesn't
count — skip it. The app's own suggestion or your earlier pin is **not**
a reference.

## Repeatable protocol (target: ≥10 sites, ≥2 sessions)

1. **Pick adjacent pairs.** Summerhill ATL (62% addr-tagged) is the best
   initial venue — pairs like 140/142 Richmond St SE sit ~10–20m apart.
   Later: Tijuana for zero-address density, San José for tagged but
   non-US addressing.
2. **For each site:**
   a. Stand at the intended property. Confirm its identity *from the
      ground*, not the map.
   b. Open 3c → collect 5 readings → pick the best real one.
   c. In 3b, place/confirm the destination using Use/drag/nudges.
      Record whether you had to correct, and what the verdict said.
   d. Save the measurement **with "real" checked**, `measuredBy`,
      region label, session label (e.g. "Trial A — Summerhill").
3. **Include hard cases deliberately:** corner houses, buildings on
   opposite sides of a street, an apartment block (expected: the app
   says ambiguous — that's a *correct* refusal, record it as such),
   and one site with no coverage (expected: `insufficient_info`).
4. **Two sessions minimum**, different days/times — GPS varies.

## Consent and privacy

Only properties you're permitted to visit. Measurements are precise
location records — exports stay on the device; don't upload them. If a
resident asks, you can show exactly what was recorded (it's all local).

## What counts as a finding

- Recurring `ambiguous` verdicts → the improvement loop surfaces
  `neighbor_confusion` with real rates (needs real n≥5).
- Sites where the top candidate was wrong → `correctBuildingIdentified: no`.
- High correction burden → `correction_effort` finding.
- Coverage failures → `coverage_gap`.

A pilot "result" is what the dashboard shows **after** real measurements
— never the fixture evaluation, which measures the software, not the world.
