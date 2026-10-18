# H1-Geo Pilot Checklist

Record of what was exercised and what still needs real user activity.
**Nothing below claims a real-world pilot occurred** — synthetic items
say so; unchecked items are genuinely untested.

## Demonstrated in this environment (automated + local UI)

- [x] Full workflow end-to-end on synthetic data — pin → observation →
      evidence → draft → review/approve → package → sign → export
      (86 → 93 automated tests; live at `127.0.0.1:8734/stage-b`)
- [x] Persistence across refresh/reopen (localStorage; store reload tests)
- [x] Stale-approval detection after edits (fingerprint-bound reviews)
- [x] Corrupted localStorage quarantine (record-store tests)
- [x] Package tamper detection (SHA-256 digest mismatch)
- [x] Signature validity vs. authorization vs. integrity distinction
- [x] Backup export/validate/restore round-trip with preserved ids and
      relationships; invalid backups rejected before any write
- [x] Filtering drafts by location, review state, evidence completeness,
      and free text

## Needs real H1 user activity (NOT done)

- [ ] A real person creating a real observation at a real location
- [ ] Real SnapN'Talk capture references linked as evidence
- [ ] A real named reviewer approving an actual draft
- [ ] Tile-serving behavior under poor/no connectivity (public OSM tiles
      are dev-only)
- [ ] Browser WebCrypto Ed25519 support matrix (tested on Node 24 only;
      UI degrades honestly if absent)
- [ ] Backup file moved across machines/browsers
- [ ] Human confirmation of the VNN export record played back through a
      real VNN intake session

## Known limitations to improve

- Signer keys are per-page-load; no key persistence or registered
  signer list (authorization is a name match only).
- Restore regenerates handoff record ids (the append-only store assigns
  them); record contents and ordering are preserved.
- `device_position` still requires HTTPS/localhost geolocation permission.
- No pruning policy for packages/signatures/exports stores.
