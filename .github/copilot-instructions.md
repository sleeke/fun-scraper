# Project Instructions

## What this repository is

A reusable, generic set of GitHub Copilot agent definitions (`.agent.md` files) that
form an automated development pipeline. These agents are designed to be copied into
**any** repository — they must remain technology-agnostic and discover the target
project's stack at runtime.

## Architecture

Three-tier agent hierarchy:

| Tier | Role | Agents |
|------|------|--------|
| **1** | Intent routing | Orchestrator |
| **2** | Workflow coordination | Feature Delivery, Refactor, Release Manager |
| **3** | Specialist execution | Spec Expander, Implementer, Code Reviewer, Architect, Quality Gate, Designer, Scribe, Deployer, Mentor |

Data flows through shared artefacts:
- `plan/ROADMAP.md` — feature backlog
- `plan/BUG_TRACKER.md` — bug tracking
- `specs/` — generated specification files (created by spec-expander)
- `agent-output/` — reports and reviews (created at runtime)

## Conventions for agent files

- **Location:** `.github/agents/<name>.agent.md`
- **Frontmatter:** YAML between `---` markers. Required fields: `name` (or `description`), `tools`.
- **Language-agnostic:** Never hard-code language, framework, or tool names in agent
  instructions. Use generic terms like "test command", "build tool", "entry point".
  Agents discover specifics from the target project's config files and
  `copilot-instructions.md`.
- **One responsibility per agent.** If an agent does two unrelated things, split it.
- **Cross-references:** When an agent delegates to another, reference by name
  (e.g. "invoke the implementer agent"), not by file path.
- **Tier discipline:** Tier 1 routes, Tier 2 orchestrates workflows, Tier 3 executes
  a single specialist task. Never skip tiers in delegation.

## Key files

- [ADAPTING.md](../ADAPTING.md) — instructions for adapting agents to a target repository
- [.github/agents/README.md](agents/README.md) — agent system overview, data flow, invocation examples
- [plan/ROADMAP.md](../plan/ROADMAP.md) — feature backlog for this repo's own development

## When editing agent instructions

1. Read the agent file and its section in `.github/agents/README.md` before modifying.
2. Preserve the agent's tier and single-responsibility scope.
3. Keep instructions generic — no language-specific examples unless clearly marked as
   illustrative (e.g. inside a "Template" section of `ADAPTING.md`).
4. If adding a new agent, also update `.github/agents/README.md` (overview table and
   data flow diagram) and the orchestrator's routing table.
5. Test trigger phrases and argument-hint examples mentally — would a user reasonably
   type them?
