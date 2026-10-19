# H1-Geo Field Operator Guide

How to run a genuine, permissioned geographic-accuracy trial with the
Stage B demo (`npm run stage-b` → `127.0.0.1:8734/stage-b`). Companion to
`docs/FIELD_TRIAL_CHECKLIST.md` — this guide covers *conduct*, that file
covers *steps*.

## Consent and privacy

- Only measure properties you are authorized to visit and record.
- Measurements contain precise coordinates — treat exports as personal
  location data. Keep them on the device; share only through channels the
  property owner/team has agreed to.
- Nothing leaves the browser — there is no upload path. Preserve that:
  do not paste export files into third-party tools.
- Mark a measurement **real** only when you are physically conducting a
  permissioned observation. Anything else stays `simulated`.

## Reference independence — the rule that matters most

The reference destination is the *truth the measurement is judged
against*. It must be established independently of the system:

- **Valid:** you are standing at the known property's entrance; a surveyed
  or otherwise verified point; a documented address confirmed on site.
- **Invalid:** the device's own GPS position (that's what we're testing);
  the candidate the app suggested; your earlier pin.

Record *how* the reference was established in the `source` field —
"standing at the front gate of the known address", "property owner's
description verified on site". A measurement with a borrowed or assumed
reference is worse than no measurement: it looks like evidence.

## Running a reading

1. Get a device fix first ("Collect 5 readings" → pick a real one; the
   app never averages). Prefer open sky; note the reported ± accuracy.
   Unstable readings (spread >10m) are themselves data — record them.
2. Place the destination on the intended building using Use/drag/nudges,
   and confirm with your name.
3. Enter the reference, answer the correct-building question honestly
   ("unknown" is a valid answer), and flag whether you had to correct.
4. Save. Check it counted as REAL in 3d.

## Repeatable tests

Do each scenario several times — single runs prove nothing:

- **Adjacent houses** (Summerhill ATL or any dense block): expect
  `multiple plausible candidates`; note whether the right one is offered.
- **Apartment/multi-unit:** overlapping outlines should stay ambiguous —
  a silent pick would be a defect, report it.
- **Rural/no-coverage:** `insufficient information` is the *correct*
  answer; a confident-looking candidate would be a defect.
- **Poor GPS:** repeat readings until stable or record the instability.
- **International:** Tijuana (no address tags — labels must stay
  "OSM building #…") and San José (tags shown as unverified).

## What NOT to do

- Don't mark dry-runs or desk exercises as real.
- Don't copy a candidate's coordinates into the reference field — that
  measures the app against itself.
- Don't discard "bad" readings selectively; honest data includes the
  misses. Note conditions in `notes` instead.
- Don't claim pilot results from the dashboard until `real n` meets the
  minimum — the app itself says "insufficient evidence" below n=5.
