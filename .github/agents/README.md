# Agent System

This directory contains reusable Copilot agents that form an automated development
pipeline. Together they provide a three-tier workflow that takes a raw requirement and
delivers tested, CI-green, deployed code. These agents are designed to be **generic** —
they discover the project's technology stack, conventions, and tooling at runtime rather
than hard-coding framework or language specifics.

For guidance on adapting these agents to a new repository, see
[ADAPTING.md](../../ADAPTING.md) in the repository root.

---

## Agent overview

### Tier 1 — Intent router

| Agent | File | Role |
|-------|------|------|
| **Orchestrator** | `orchestrator.agent.md` | Top-level coordinator. Parses user intent and delegates to the appropriate Tier 2 workflow agent. |

### Tier 2 — Workflow agents

| Agent | File | Role |
|-------|------|------|
| **Feature Delivery** | `feature-delivery.agent.md` | End-to-end feature pipeline: spec → implement → review → test → deploy → learn. |
| **Refactor** | `refactor.agent.md` | Analysis & remediation: audit → triage → fix → verify → deploy → learn. |
| **Release Manager** | `release-manager.agent.md` | Production releases: pre-flight quality gate → deploy → learn. |

### Tier 3 — Specialist agents

| Agent | File | Role |
|-------|------|------|
| **Spec Expander** | `spec-expander.agent.md` | Expands terse requirements into detailed, testable spec files in `specs/`. |
| **Implementer** | `implementer.agent.md` | Writes and modifies code in a strict test-driven discipline. |
| **Code Reviewer** | `code-reviewer.agent.md` | Reviews code for smells, design issues, and AI-generated code pitfalls. |
| **Architect** | `architect.agent.md` | Audits codebase architecture against project standards and best practices. |
| **Quality Gate** | `quality-gate.agent.md` | Runs CI suite with auto-fix feedback loop via the implementer. |
| **Designer** | `designer.agent.md` | Proposes and implements visual redesigns across the UI layer. |
| **Scribe** | `scribe.agent.md` | Generates and maintains per-folder README documentation. |
| **Deployer** | `deployer.agent.md` | Runs the deployment pipeline and reports the outcome. |
| **Mentor** | `mentor.agent.md` | Analyses sessions to extract lessons and improve agent instructions. |

---

## Data flow

```mermaid
flowchart TD
    A["Requirement Input<br/>(prompt text · file · plan/ROADMAP.md)"] --> B["<b>Orchestrator</b><br/>Routes to workflow agent"]

    B -->|"Feature work"| C["<b>Feature Delivery</b><br/>End-to-end pipeline"]
    B -->|"Analysis/refactor"| D["<b>Refactor</b><br/>Audit &amp; remediate"]
    B -->|"Release"| E["<b>Release Manager</b><br/>Quality gate &amp; deploy"]

    C --> F["Tier 3 Specialists<br/>(spec-expander → implementer →<br/>code-reviewer → quality-gate →<br/>scribe → deployer → mentor)"]

    D --> F
    E --> G["Tier 3 Specialists<br/>(quality-gate → deployer → mentor)"]

    F --> H["Completion summary<br/>to user"]
    G --> H

    style A fill:#f0f4ff,stroke:#4a6fa5
    style B fill:#fff3e0,stroke:#e09840
    style C fill:#e8f5e9,stroke:#4caf50
    style D fill:#e3f2fd,stroke:#2196f3
    style E fill:#f3e5f5,stroke:#9c27b0
    style F fill:#fff8e1,stroke:#ff9800
    style G fill:#fff8e1,stroke:#ff9800
    style H fill:#e8f5e9,stroke:#4caf50
```

---

## How agents discover the project

These agents do **not** hard-code technology-specific commands or file paths. Instead,
each agent begins with a **discovery phase** where it reads:

1. **`.github/copilot-instructions.md`** — the project's architecture rules, conventions,
   and constraints. This is the single source of truth for project-specific standards.
2. **Project configuration files** — dependency manifests (`package.json`, `Cargo.toml`,
   `go.mod`, etc.), compiler config, framework config, and CI configuration.
3. **`plan/ROADMAP.md`** — planned features and prepared requirements.

Agents adapt their behaviour based on what they discover — using the correct test commands,
lint tools, build steps, and deployment procedures for the project at hand.

---

## Artefact locations

| Artefact | Path | Purpose |
|----------|------|---------|
| Specification files | `specs/<slug>.md` | Detailed, testable specs produced by Spec Expander |
| Temporary test notes | `agent-output/<slug>-temp-tests.md` | Documents temporary tests with removal conditions |
| Architecture rules | `.github/copilot-instructions.md` | Canonical constraints all agents must follow |
| Roadmap | `plan/ROADMAP.md` | Source of prepared requirements (Priority 3 input) |
| Bug tracker | `plan/BUG_TRACKER.md` | Tracks open bugs and their status |
| Architect report | `agent-output/Architect-Review.md` | Output of the architect agent |
| Code review report | `agent-output/Code-Review.md` | Output of the code-reviewer agent |
| Design summary | `agent-output/design-summary.md` | Output of the designer agent |

---

## Invocation examples

```
# Full feature pipeline from a prompt requirement
@orchestrator Add rate limiting to the API

# Full pipeline from plan/ROADMAP.md
@orchestrator Process prepared requirements

# Spec only (no implementation)
@spec-expander Add a caching layer to the data access module

# Fix failing tests after a manual code change
@implementer All tests

# Analyse the codebase architecture
@orchestrator Analyse the codebase

# Deploy to production
@orchestrator Deploy to production

# Review a specific file
@code-reviewer scope:file target:src/auth/login.ts
```
