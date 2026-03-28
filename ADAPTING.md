# Adapting These Agents to Your Repository

This guide explains how to take the generic agent team in `.github/agents/` and tailor
it to a specific project. The agents are designed to be technology-agnostic — they
discover your stack at runtime — but a small amount of configuration makes them
significantly more effective.

---

## Quick start (5 minutes)

1. **Copy** the `.github/agents/` directory into your repository.
2. **Create** `.github/copilot-instructions.md` with your project's rules (see template
   below).
3. **Create** `plan/ROADMAP.md` with your backlog (optional but recommended).
4. **Done.** The agents will discover everything else from your project's configuration
   files.

---

## What the agents need to know

The agents discover your project's technology stack by reading configuration files at
runtime. However, they rely on **one key file** for project-specific conventions:

### `.github/copilot-instructions.md`

This is the single source of truth that all agents consult. It should document:

| Section | What to include | Example |
|---------|----------------|---------|
| **Tech stack** | Language, framework, major libraries | "Next.js 16 App Router, TypeScript, Tailwind CSS v4" |
| **Architecture rules** | Rendering boundaries, module structure, data flow | "Only NavBar, FilterBar, and ContactForm may use `'use client'`" |
| **Styling conventions** | Design tokens, CSS approach, theming | "All colours must use CSS variables from the `@theme` block in `globals.css`" |
| **Testing requirements** | Test framework, file conventions, coverage rules | "Component tests use Vitest + Testing Library in `__tests__/components/`" |
| **Content/data rules** | Where data lives, how it's accessed | "All project data lives in MDX files under `content/projects/`" |
| **CI commands** | How to run tests, lint, build, deploy | "`npm run test`, `npm run lint`, `npm run build`" |
| **Deployment** | Hosting platform, deploy command, live URL pattern | "Firebase Hosting via `npm run deploy`, URL: `https://project.web.app`" |

### Template

```markdown
# Project Instructions

## Tech stack
- Language: [e.g. TypeScript]
- Framework: [e.g. Next.js 16 App Router]
- Styling: [e.g. Tailwind CSS v4 with design tokens in `app/globals.css`]
- Testing: [e.g. Vitest for unit tests, Playwright for E2E]

## Architecture rules
- [e.g. Pages are React Server Components by default]
- [e.g. Only NavBar, FilterBar, and ContactForm may use `"use client"`]
- [e.g. All data access goes through `lib/content.ts`]

## Styling conventions
- [e.g. All colour values must reference CSS variables from the `@theme` block]
- [e.g. No arbitrary Tailwind values — use design tokens]

## Testing conventions
- [e.g. Component tests in `__tests__/components/<Name>.test.tsx`]
- [e.g. E2E tests in `e2e/<name>.spec.ts`]
- [e.g. Use `@testing-library/user-event` for interactions]

## CI commands
- Unit tests: `npm run test`
- Lint: `npm run lint`
- E2E tests: `npm run test:e2e`
- Build: `npm run build`

## Deployment
- Platform: [e.g. Firebase Hosting]
- Command: `npm run deploy`
- Live URL: [e.g. `https://project-id.web.app`]
```

---

## Customising individual agents

Most agents work out of the box. You may want to customise these:

### Designer agent

The designer agent contains a library of design vocabulary (gradients, animations,
typography pairings, etc.) that is web-focused. If your project is not a web application,
you may want to:

- Remove or replace the design vocabulary section.
- Update the "Architectural constraints" section to match your project.
- Adjust the design summary format.

### Deployer agent

The deployer agent uses a generic discovery phase to find your deploy command. For complex
deployment pipelines, you may want to add specific instructions:

```markdown
## Project-specific deployment

The deployment pipeline is defined in `scripts/deploy.sh` and runs:
1. Build: `npm run build`
2. Deploy: `firebase deploy --only hosting`
3. Smoke test: `npm run test:smoke`

The live URL is: `https://my-project.web.app`
```

### Architect agent

The architect's review areas are generic (framework correctness, styling compliance,
data architecture, testing, maintainability). For projects with domain-specific
architectural concerns, add review areas to the agent's instructions:

```markdown
### Phase N — [Your domain concern]

**Standard:** [Document the standard]

Steps:
1. [Specific checks to perform]
```

---

## Removing agents you don't need

Not every project needs every agent. Safe removals:

| Agent | Safe to remove if... |
|-------|---------------------|
| **Designer** | Your project has no UI / visual component |
| **Deployer** | You deploy through CI/CD only (no agent-triggered deploys) |
| **Scribe** | You don't want auto-generated folder READMEs |

If you remove an agent, also update:

1. The **feature-delivery** and **refactor** agent instructions to remove references
   to the removed agent in their workflow phases.
2. The **orchestrator** hierarchy diagram (cosmetic).
3. The `.github/agents/README.md` overview table.

---

## Merging into an existing agent team

If your repository already has Copilot agents, you can merge this team with your
existing agents. Use the following prompt with Copilot to perform the merge:

### Suggested merge prompt

```
I have two sets of Copilot agents that I want to merge into a single cohesive team:

**Existing agents** (in `.github/agents/`):
[List your existing agent files]

**New agents** (from the copilot-agents repository):
- orchestrator.agent.md — intent router (Tier 1)
- feature-delivery.agent.md — end-to-end feature pipeline (Tier 2)
- refactor.agent.md — analysis & remediation pipeline (Tier 2)
- release-manager.agent.md — production release pipeline (Tier 2)
- spec-expander.agent.md — requirement → spec (Tier 3)
- implementer.agent.md — spec/fix-list → code (Tier 3)
- code-reviewer.agent.md — code review & smell detection (Tier 3)
- architect.agent.md — architectural audit (Tier 3)
- quality-gate.agent.md — CI enforcement with auto-fix loop (Tier 3)
- designer.agent.md — visual design & implementation (Tier 3)
- scribe.agent.md — folder README documentation (Tier 3)
- deployer.agent.md — deployment pipeline runner (Tier 3)
- mentor.agent.md — session analysis & agent improvement (Tier 3)

Please:

1. **Analyse both sets** — read all agent instruction files and identify overlapping
   responsibilities, complementary capabilities, and potential conflicts.

2. **Propose a merged hierarchy** — show how the agents should be organised together.
   For agents with overlapping responsibilities, recommend whether to:
   - Keep the existing agent and discard the new one
   - Keep the new agent and discard the existing one
   - Merge both into a single agent that combines their strengths
   - Keep both with clarified, non-overlapping scopes

3. **Update cross-references** — ensure all agents reference each other correctly
   (the orchestrator's routing table, workflow agents' delegate tables, etc.).

4. **Resolve conflicts** — if both sets have an orchestrator or coordinator, merge
   them into one. The three-tier hierarchy (router → workflow → specialist) should
   be preserved.

5. **Update documentation** — update `.github/agents/README.md` to reflect the
   merged team.

Present your plan before making changes.
```

### Merge tips

- **Preserve the tier structure.** The three-tier model (intent router → workflow →
  specialist) scales well. Map your existing agents into the appropriate tier.
- **One responsibility per agent.** If two agents overlap, merge them or clearly
  delineate scope.
- **The orchestrator is the entry point.** Users should be able to invoke `@orchestrator`
  for any request. Update its routing table to include your existing workflows.
- **`copilot-instructions.md` is shared.** All agents (existing and new) should read the
  same project instructions file.

---

## Directory structure

After adaptation, your repository should look like this:

```
your-repo/
├── .github/
│   ├── agents/
│   │   ├── README.md                  # Agent system documentation
│   │   ├── orchestrator.agent.md      # Tier 1: intent router
│   │   ├── feature-delivery.agent.md  # Tier 2: feature pipeline
│   │   ├── refactor.agent.md          # Tier 2: analysis & remediation
│   │   ├── release-manager.agent.md   # Tier 2: production releases
│   │   ├── spec-expander.agent.md     # Tier 3: requirement → spec
│   │   ├── implementer.agent.md       # Tier 3: spec → code
│   │   ├── code-reviewer.agent.md     # Tier 3: code review
│   │   ├── architect.agent.md         # Tier 3: architecture audit
│   │   ├── quality-gate.agent.md      # Tier 3: CI enforcement
│   │   ├── designer.agent.md          # Tier 3: visual design
│   │   ├── scribe.agent.md            # Tier 3: documentation
│   │   ├── deployer.agent.md          # Tier 3: deployment
│   │   └── mentor.agent.md            # Tier 3: learning
│   └── copilot-instructions.md        # Project-specific rules (you create this)
├── plan/
│   ├── ROADMAP.md                     # Feature backlog
│   └── BUG_TRACKER.md                 # Bug tracking
├── specs/                             # Generated spec files (created by spec-expander)
├── agent-output/                      # Agent reports (created at runtime)
└── ADAPTING.md                        # This file
```

---

## FAQ

### Do I need to create `copilot-instructions.md`?

Strongly recommended. Without it, agents will still work — they'll discover your stack
from configuration files — but they won't know your project-specific conventions (which
components may be client-side, what your testing conventions are, etc.).

### Can I use these agents with a non-JavaScript project?

Yes. The agents are language-agnostic. They discover the test command, lint command, build
command, and deploy command from your project's configuration files and
`copilot-instructions.md`. They have been designed to work with any language or framework.

### What if I only want some of the agents?

See the "Removing agents you don't need" section above. The core trio (orchestrator +
feature-delivery + implementer) is the minimum for a useful pipeline.

### How do the agents learn and improve over time?

The **mentor** agent analyses completed sessions and suggests improvements to other
agents' instructions. In "apply mode", it edits the instruction files directly. Over time,
the agents accumulate project-specific knowledge in their instruction files.

### Can I add my own custom agents?

Yes. Create a new `.agent.md` file in `.github/agents/` following the same frontmatter
format. To integrate it into the pipeline:

1. Decide which tier it belongs to (workflow or specialist).
2. Add it to the relevant workflow agent's delegate table.
3. Add a phase in the workflow agent's execution flow where it gets invoked.
4. Update the orchestrator's routing table if it's a new Tier 2 workflow.
5. Update `.github/agents/README.md`.
