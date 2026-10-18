# GEO-010 — End-to-End Geographic Opportunity: Completion Report
Status: Implemented and verified locally, 2026-10-17. GEO-010 changes uncommitted on `foundation/geo-002-plumbing` (base `91a54de`) for review. GEO-009 committed/pushed as `91a54de` under step 1 (80/80 verified green first).

## What GEO-010 adds

### A. Workflow navigation (`src/stage-b/workflow.js` + UI)
- A **"where you are" progress strip** at the top of the page: 8 numbered chips (save location → observation → evidence → draft → review/approve → package → sign → export). Done = green, current = blue, each with a plain-language detail line ("missing: currency", "approve a draft first").
- `workflowStatus(stores, selectedId)` computes everything live from the stores — no parallel state.
- A **"0. Start here"** section with a resume line ("Saved work on this machine: N location(s), M draft(s)…") so returning users see their work survived.

### B. H1 operational example
"Load H1 example (synthetic)" loads a labeled scenario — **storm-damaged cedar perimeter fence at a residential lot**, an H1 service opportunity — through the *existing* store save paths (no duplicate logic): manual pin, observation summary, two evidence references (a SnapN'Talk capture ref + a document ref), and a completed draft (title/outcome/capabilities `["fencing"]`/timing/evidence requirements/450 USD approximate). Everything it writes is marked `SYNTHETIC` in provenanceRef, notes, and observation text.

### C. Experience & recovery
- All state persists in localStorage; reload resumes exactly where the user left off (covered by tests).
- `STATE_TEXT` explains states in ordinary language: declined ("a reviewer rejected this draft version"), stale ("changed after approval — a fresh review is required"), unsigned ("optional trust layer — generate a key, sign the package").
- Trust limits stay visible but unobtrusive: the section-8 hint states the four-way distinction; evidence authenticity always reports `not_established`.

### D. Tests
86/86 pass (80 prior + 6 new end-to-end): full 8-stage scenario walkthrough, reload persistence, stale-after-edit reverting the review stage, invalid + dangling evidence rejection, unsigned-package verdict semantics, declined-draft packaging rejection with explained stage state.

## Try the full workflow
1. `npm run stage-b` → open `http://127.0.0.1:8734/stage-b`.
2. Section 0: click **Load H1 example (synthetic)** — pin, observation, evidence, and a completed draft appear; the strip shows stages 1–4 done.
3. Enter a reviewer name (section 6), click **Approve handoff** on the draft.
4. Click **Generate handoff package** → package card shows digest + `ready=true`.
5. Section 8: **Generate signer key** → set signer name to the reviewer → **Sign package** → **Verify trust** shows the four-way verdict.
6. Set requester_ref → **Preview VNN export** → **Confirm export record**. Strip goes fully green.
7. Refresh the page — everything is still there.

## Verification
- `npm test`: **86/86 pass**.
- Factory validators (read-only scratch): syntax / constitutional / security **PASS**, zero warnings after the synthetic UUID was re-shaped (the all-zero capture id tripped a phone-number heuristic — fixed by using a lettered UUID, still clearly synthetic).
- `git diff --check`: clean; demo serving at `127.0.0.1:8734/stage-b`.

## Boundaries held
Everything local; no live VNN mission, no deploy, no other-repo changes, no merge. The scenario is explicitly synthetic; exports remain prepared records, never submissions.
