---
mode: agent
description: >
  Review the current file (or a named file/branch) for code smells, design issues,
  and AI-generated code pitfalls. Produces a structured Code-Review.md report.
---

Review the following for code smells, design issues, AI pitfalls, and maintainability concerns.

**Scope:**
${input:file path, branch name, or "project" for full codebase — defaults to the current file}

**Focus area (optional):**
${input:security | performance | testing | architecture | all — defaults to all}

Produce the report at `agent-output/Code-Review.md` and summarise critical findings inline.
