# H1-GEO-002 — Foundation and First Operational Vertical Slice
Status: Founder authorized foundational writing. Implementation and integration gates remain separate.

## Business goal
Make it possible to identify a location, record an accurate and reviewable observation, and prepare a legitimate service opportunity candidate for eventual H1-VNN routing. Success is not a map demo or a pile of unverified leads.

## Stage A — Foundation (first)
- Create a versioned, provider-neutral coordinate assertion contract and validation library.
- Add tests for boundaries, non-finite values, source attribution, unknown accuracy, timestamps, and no fabricated certainty.
- Establish repository charter, architectural authority, evidence and field-education requirements.
- Define stable observation and opportunity-candidate references without copying SnapN'Talk or VNN.
- Establish reproducible test commands and no-write-by-default engineering practices.

Acceptance: tests green; documentation matches code; no network calls or production data writes; reviewable diff.

## Stage B — First operational capability (separate approval gate)
- Browser map with fast manual pinning and optional device positioning.
- Multiple observations without silently merging distinct records.
- Save, reopen and inspect a pin and its uncertainty/source.
- Optional evidence linkage to the real SnapN'Talk contract, isolated scratch root.
- Reviewable candidate status: unverified, needs-review, verified only with explicit evidence/authority.
- Demonstrate VNN payload compatibility with dry-run fixtures, not real mission creation.
- Measure time-to-pin, pin accuracy against reference points, persistence/reopen, retry idempotency and failure recovery.

Acceptance: real working UI, screenshots, repeatable tests, blocked/offline/denied scenarios, zero production writes.

## Gates
No HomeVault integration until its Property persistence authority is resolved. No live VNN mission writes until permission and review flow is verified. No professional measurement claims without ground-truth benchmark datasets. No drone/robotics expansion before separately scoped requirements. No provider selection by brand reputation alone.

## Anti-goals
No separate roofing-only geospatial model, no duplicate capture service, no VNN replacement, no speculative AI damage scoring, no premature migration of Ride-MX, no uncontrolled repo restructuring.

## Handoff report
Every implementation stage must return changed paths, tests with commands and counts, skipped/blocked cases, data roots touched, screenshots when applicable, risks and next gate recommendation.
