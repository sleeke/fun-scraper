---
mode: agent
description: >
  Generate tests for a file, function, or module. Follows the project's test conventions,
  asserts on structure not content, and covers happy-path, edge cases, and error cases.
---

Write tests for the following, following the project's test conventions discovered from `copilot-instructions.md` and the existing test structure.

**Target:**
${input:file path, function name, or module — e.g. "src/auth/login.ts" or "the checkout flow"}

**Test layer:**
${input:unit | component | integration | e2e | all — defaults to unit}

**Coverage focus:**
${input:happy path only | edge cases | error handling | all — defaults to all}

Requirements:
- Assert on structure and behaviour, not specific string content or design values.
- Mock all external services and I/O.
- Cover: normal input, empty/null input, and at least one error condition.
- Place test files following the project's test file naming conventions.
