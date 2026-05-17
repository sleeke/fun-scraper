# Mentor Report — 2026-05-17

## Session Summary

**Bug:** Two scraper modules for the same venue/source were present in the scrapers directory. One pointed to a dead domain and used bare-bones selectors; the other was a more robust re-implementation targeting a live domain. Both returned zero events — the first because the domain was dead and the selectors were wrong, the second because the domain was unreachable from the sandbox.

**Fix:** Rewrote the canonical scraper file, absorbing the robust selector logic from the duplicate; deleted the duplicate; updated the scraper registry, frontend source list, and integration test references. Added 15 regression unit tests covering primary parsing, link-fallback parsing, and the empty-page edge case.

**Agents involved:** `bug-fix`, `implementer` (invoked via general-purpose), `quality-gate`

**Outcome:** All 3 CI gates green on first pass. 106 backend tests passed, lint clean, frontend build clean.

**Diagnosis speed:** Fast — both candidate files were read in parallel in the first round-trip; root cause was clear from the code alone.

**Fix precision:** Minimal — 6 files touched (1 deleted, 5 modified/created), no unrelated changes.

---

## Participating Agents

| Agent | Instruction file |
|-------|-----------------|
| bug-fix | `.github/agents/bug-fix.agent.md` |
| implementer | `.github/agents/implementer.agent.md` |
| quality-gate | `.github/agents/quality-gate.agent.md` |
| mentor | `.github/agents/mentor.agent.md` |

---

## Per-Agent Suggestions

---

### Suggestions for bug-fix

**File:** `.github/agents/bug-fix.agent.md`

#### Dead-End Prevention

**Suggestion 1: Duplicate-implementation check for zero-output data sources**

- **Context:** The root cause was two sibling module files implementing the same data source — one a stale original, one a later re-implementation. The session diagnosed this quickly because both files were read in parallel, but the bug-fix agent's Phase 1 instructions contain no explicit heuristic for this class of zero-output bug.
- **Current gap:** Phase 1 ("Locate the relevant code") instructs the agent to find the file most likely responsible for the behaviour, but offers no guidance for the specific scenario where a data source is silently returning empty results. A duplicate sibling is easy to detect — same `SOURCE` constant or same target URL appearing in two files — but only if the agent knows to look.
- **Proposed addition:** Add the following bullet to **Phase 1 — step 2** ("Locate the relevant code"), after the existing instruction to read files at targeted line ranges:

  ```
  - When a data-source module (scraper, feed reader, API client) returns zero results,
    scan all sibling modules in the same directory for duplicate SOURCE identifiers or
    identical target URLs before investing in selector or parsing analysis. A duplicate
    implementation — often a stale original alongside a newer re-implementation — is a
    common, quickly-detectable cause of zero-output bugs.
  ```

- **Rationale:** This heuristic turns a lucky observation (two files happened to be read in parallel) into a deliberate diagnostic step. It costs one directory scan and prevents the agent from sinking tokens into selector analysis when the real problem is a redundant file.

---

**Suggestion 2: Verify endpoint liveness before selector/parsing analysis**

- **Context:** Both scraper files returned zero results regardless of selector quality because neither target domain resolved from the sandbox. Had the agent attempted to fix the selectors first, it would have chased a symptom rather than the cause. The session avoided this only because reading the source code directly revealed the dead domain — no intermediate selector-fixing attempt was made.
- **Current gap:** Phase 1 has no explicit step for distinguishing a network/DNS failure from a parsing failure when the symptom is "zero results". Both produce identical observable output, but the fix paths are completely different. The agent's instructions say "Trace the failure path" but provide no triage split between "upstream unreachable" and "upstream reachable but parsed incorrectly".
- **Proposed addition:** Add the following bullet to **Phase 1 — step 3** ("Trace the failure path"), as the first sub-step when the symptom involves a data source returning empty output:

  ```
  - Before analysing selectors, parsing logic, or data transformation, verify that the
    upstream endpoint is reachable: attempt a basic HTTP HEAD or GET request to the
    target URL. A non-2xx response or DNS failure is a simpler root cause than a
    selector mismatch and rules out an entire class of investigation before it begins.
    If the sandbox cannot reach external hosts, note this explicitly and base the
    diagnosis on static code analysis alone — do not assume the selectors are at fault.
  ```

- **Rationale:** A dead or unreachable endpoint is a fundamentally different defect class from a broken selector. Surfacing it immediately prevents the agent from producing a fix (new selectors) that would still return zero results once deployed, wasting a full implementation + quality-gate cycle.

---

### Suggestions for implementer

No suggestions. The implementer completed all fix items correctly on the first attempt: absorbed the robust selector logic, deleted the duplicate file, updated all registry references (scraper index, frontend source list, integration test), and added 15 regression tests covering the primary code paths. All CI gates passed on first pass with no quality-gate feedback loop needed.

---

### Suggestions for quality-gate

No suggestions. The quality-gate reported green on first invocation with zero implementer retries. No gaps were observed in its execution.

---

## Priority Ordering

| Rank | Agent | Suggestion | Estimated time saved |
|------|-------|------------|---------------------|
| 1 | bug-fix | Verify endpoint liveness before selector/parsing analysis | High — prevents a full mis-directed fix cycle (implement wrong thing → quality-gate → re-diagnose) |
| 2 | bug-fix | Duplicate-implementation check for zero-output data sources | Medium — saves one diagnostic round-trip when the root cause is a duplicate file |

The liveness check ranks higher because a false diagnosis of "broken selectors" would have triggered an implementation phase, a quality-gate run, and then a re-diagnosis — three phases wasted. The duplicate check is a one-step directory scan that at worst costs nothing if the pattern isn't present.

---

## Mentor Self-Review

- **Suggestion count:** 2 suggestions across 1 agent. Both clear all quality filters: repo-agnostic, actionable, grounded in a concrete session event, non-contradictory with existing instructions, and unlikely to rot.
- **Agents missed:** None. All four participating agents (bug-fix, implementer, quality-gate, mentor) were evaluated. Implementer and quality-gate had no actionable gaps.
- **Over-production check:** A third candidate suggestion — "treat file deletion + registry cleanup as an atomic fix unit" — was considered for the implementer but dropped because the implementer already executed the pattern correctly on the first pass. Including it would be padding.
- **Instruction bloat:** The bug-fix agent's instructions are moderately sized (~200 lines). Adding two focused bullets to Phase 1 (steps 2 and 3) will not meaningfully increase prompt size.
- **Mentor's own performance:** Operated correctly in report mode. No edits to agent files were made. The report is self-contained and portable to the agent definition repo.

---

## Propagation Hints

> These suggestions should be applied to the **agent definition repo** (the repo that owns
> the canonical `.github/agents/` files). Copy this report there and run Mentor in Apply
> mode to incorporate the changes.

| Agent | File | Suggestion title | Priority |
|-------|------|-----------------|----------|
| bug-fix | `.github/agents/bug-fix.agent.md` | Verify endpoint liveness before selector/parsing analysis | High |
| bug-fix | `.github/agents/bug-fix.agent.md` | Duplicate-implementation check for zero-output data sources | Medium |
