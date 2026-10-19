# H1-Geo Field Trial Checklist

Repeatable procedure for permissioned field measurements (section 3c/3d of
the Stage B demo). Everything stays on this device — nothing is uploaded.

## Before going out

- [ ] Operator name and session label decided (e.g. "Trial A — Summerhill").
- [ ] Location permission understood: the browser will ask; if denied, the
      measurement still saves with no device fix (honest, not a failure).
- [ ] Reference method agreed **in advance**: the reference must be
      independently established (you are physically at the known property /
      a surveyed point / a verified address source). Your own pin or the
      device's own position is **not** a valid reference.

## Per measurement

1. Stand at or near the intended destination.
2. "Capture device position for this measurement" → record appears with
   reported ± accuracy.
3. In 3b, let the candidate list load; use **Use** / drag / nudge to place
   the destination on the intended building. Confirm with a named
   "Confirmed by".
4. In 3c enter the **reference** coordinates + how they were established,
   correct-building answer, and whether the selection needed correcting.
5. Tick "genuine, permissioned field observation" **only** for real checks.
6. Save; check it appears in 3c list and moves the 3d dashboard.

## Scenario coverage (repeat per site)

| Scenario | Where | What to watch |
|---|---|---|
| Adjacent houses | Summerhill ATL | `multiple_plausible` expected; does the correct house appear in candidates? |
| Apartment / multi-unit | dense ATL or Libertad MX | several candidates inside one outline — ambiguity must stay honest |
| Corner property | any | two plausible frontages |
| Rural / sparse | outside extracts | `insufficient_info` is the correct answer, not a guess |
| Tijuana dense block | Libertad MX | zero address tags — labels must stay "OSM building #…" |
| San José centro | CR | address tags present but unverified |
| Poor GPS | indoor / canyon | accuracy ±50m+ should widen ambiguity, not narrow it |

## After the session

- [ ] "Export trial results" — JSON stays local; treat as location data.
- [ ] Dashboard shows `real n` growing; launch-grade statements need n≥5
      per the built-in threshold (more is better).

## Prohibited

- No uploading measurements to external services.
- No marking simulated runs as real.
- No using your own pin/selection as the reference.
