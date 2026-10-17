# H1-GEO-003 — Builder Mission Contract and Stage B Readiness
Status: Authorized by founder on 2026-10-17. This document defines the scope of a local engineering verification mission; it does not assert that containment is already enforced.

## Objective
Reuse existing H1 builder security, Factory validators, and release protections. Prevent accidental cross-repository changes and preserve unfinished work. Confirm practical controls, then prepare the first operational H1-Geo map slice. Do not rebuild systems that already exist.

## Authority and scope
- Primary writable project: `C:\dev\H1-Geo` on `foundation/geo-002-plumbing`.
- Read-only inspection, if present: H1-Sandbox-Factory, H1-Trust-Engineering, and other repositories demonstrably relevant to builder execution policy. Prefer targeted searches and manifests over broad repeated audits.
- Never modify, reset, stash, clean, merge, install into, or migrate another repository.
- No access to real HomeVault data, credentials, production services, or third-party accounts for this mission.
- Existing H1-Geo changes must be inspected and preserved before modification.
- No package additions, background services, external API keys, paid vendors, deployments, or production writes without a separate decision.
- Commit/push only with explicit authorization. Never merge to main under this mission.

## Required reuse inventory
Find existing controls before designing anything new:
1. Factory sandbox lifecycle, validator scripts, promotion gates, evidence reports and actual runnable status.
2. Trust Engineering guards, hooks, policy checks, threat tests, and whether they apply to Devin Local.
3. Any shared H1 builder/workspace permissions, allowlists, preflight checks, and audit logs.
For each candidate, record exact repository/path, purpose, evidence of execution, applicability to H1-Geo, and disposition: REUSE, ADAPT, MISSING, BLOCKED, or NOT APPLICABLE. Do not infer operational enforcement from a README.

## Containment preflight
Before modifying H1-Geo:
- Record branch, HEAD, git status, and intended paths.
- Determine actual working-directory and filesystem write boundaries of the builder. A prompt-only rule is not a sandbox.
- Check that proposed guards are compatible with the builder runtime. Do not assume hooks are installed or enforced.
- Run bounded synthetic negative tests in an isolated scratch area for out-of-scope paths, traversal, symlink escape, destructive commands, and attempted production access where safe. Never use another real H1 repo as a test target.
- If enforcement is missing, mark it as missing; apply least-privilege execution where available, or require a human-controlled execution boundary. Do not claim 'enforced' based only on instruction compliance.

## Deliverables
- `docs/GEO-003_REUSE_AND_CONTAINMENT_REPORT.md`: evidence-backed inventory, verified controls, gaps, tests and next decisions.
- `docs/GEO-003_STAGE_B_READINESS.md`: scoped Stage B plan, map-provider selection questions, persistence strategy, test and demonstration criteria.
- Only minimal H1-Geo-specific guard configuration if truly missing, supported by tests and approved in scope. Do not fork an existing shared guard framework.

## Stage B functional target (not yet authorized for implementation)
Fast map pinning, manual-target vs device-position distinction, local persistence and reopen, optional evidence reference, unverified opportunity candidate, offline/denied-permission behavior. No live VNN writes, no HomeVault migration, no professional measurements.

## Evidence and stop rules
Return all touched paths, pre/post git status, exact commands, test counts and failures, any blocked tests, and explicit proof or absence of actual enforcement. Stop for any out-of-scope write requirement, missing approval, unsafe access, or unresolved data boundary. Report gaps rather than circumventing guards.

## Definition of done
Existing controls located and dispositioned; containment assessed with synthetic tests; remaining gaps made explicit; Stage B plan ready for founder review. Stage B begins only after this checkpoint.
