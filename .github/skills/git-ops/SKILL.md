---
name: git-ops
description: >
  Use when: performing git workflow operations — creating branches, writing commit
  messages, opening pull requests, creating git tags, managing merge conflicts, or
  following the project's branching strategy. Load this skill before any git-related
  implementation step.
---

# Git-Ops Skill

Provides conventions and decision rules for git workflow operations. Load this skill
when any agent needs to create branches, commit changes, tag releases, or open pull
requests.

---

## Branching strategy

Discover the project's branching strategy from `copilot-instructions.md` or infer it
from the existing branch structure (`git branch -a`). Common strategies:

| Strategy | Main branch | Feature branches | Release branches |
|----------|-------------|------------------|------------------|
| **GitHub Flow** | `main` | `<type>/<slug>` | Tags only |
| **Git Flow** | `main` + `develop` | `feature/<slug>` | `release/vX.Y.Z` |
| **Trunk-based** | `main` | Short-lived `<type>/<slug>` | Tags only |

If no strategy is documented, default to **GitHub Flow**.

### Branch naming conventions

Use the format `<type>/<slug>` where:

| Type | When to use |
|------|------------|
| `feat/` | New feature work |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring without behaviour change |
| `docs/` | Documentation-only changes |
| `chore/` | Maintenance, dependency updates, build changes |
| `release/` | Release preparation branches (Git Flow only) |

`<slug>` should be a short kebab-case description of the change (e.g. `feat/rate-limiting`, `fix/null-pointer-login`).

### Creating a branch

```bash
# Create and switch to a new branch from the current HEAD
git checkout -b <type>/<slug>

# Or from a specific base (e.g. develop in Git Flow)
git checkout -b <type>/<slug> develop
```

---

## Commit message format

Follow [Conventional Commits](https://www.conventionalcommits.org/) unless
`copilot-instructions.md` specifies otherwise.

### Format

```
<type>(<scope>): <short description>

[optional body — explain WHY, not WHAT]

[optional footer — Breaking changes, closes #issue]
```

### Type reference

| Type | Use for |
|------|---------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `chore` | Build process, tooling, dependency updates |
| `perf` | Performance improvement |
| `ci` | CI configuration changes |

### Rules

- Subject line: max 72 characters, imperative mood ("add" not "added"), no trailing period.
- Body: explain *why* the change was made, not *what* (the diff shows what).
- Breaking changes: add `BREAKING CHANGE:` footer or append `!` to the type (e.g. `feat!:`).
- Reference issues: `Closes #42` or `Fixes #42` in the footer.

### Examples

```
feat(auth): add JWT refresh token rotation

fix(checkout): prevent duplicate order submission on double-click

Closes #142

chore: upgrade dependencies to address security advisories

BREAKING CHANGE: minimum Node version is now 20
```

---

## Staging and committing

### What to stage

- Stage only files directly related to the change being committed.
- Use `git add <specific-files>` rather than `git add .` to avoid accidentally staging
  unrelated files (e.g. environment files, build artefacts, OS metadata).
- Before staging, run `git status` and `git diff --stat` to confirm what changed.

### Verification before commit

```bash
# See what will be committed
git diff --cached --stat

# Run a quick sanity check
git diff --cached | head -100
```

---

## Pull requests

### When to open a PR

Open a PR when:
- A feature branch is ready for review (before merging to `main` or `develop`).
- A bug fix on a branch needs a second review.
- Any change that affects shared infrastructure, APIs, or public interfaces.

### PR title

Follow the same Conventional Commits format as commit messages:
`feat(auth): add OAuth2 PKCE flow`

### PR description template

```markdown
## Summary
<!-- 1-3 sentences: what does this PR do? -->

## Motivation
<!-- Why is this change needed? -->

## Changes
- [ ] File 1 — what changed
- [ ] File 2 — what changed

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing steps (if applicable)

## Checklist
- [ ] Tests pass locally
- [ ] No new lint errors
- [ ] Docs updated (if applicable)
```

### Using GitHub CLI (`gh`)

```bash
# Create a PR from the current branch to main
gh pr create --title "feat(auth): add PKCE flow" --body-file .pr-body.md --base main

# Create a draft PR
gh pr create --draft --title "WIP: ..." --body "..."

# Merge after approval (squash merge is common for GitHub Flow)
gh pr merge --squash --delete-branch
```

---

## Git tags

### When to create a tag

- After every production release (version bump commits).
- Use annotated tags (not lightweight) so the tag carries metadata.

### Creating and pushing a tag

```bash
# Create an annotated tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# Push the tag to the remote
git push origin vX.Y.Z

# Push all tags (use sparingly — prefer specific tags)
git push --tags
```

### Tag naming

Follow [Semantic Versioning](https://semver.org/): `vMAJOR.MINOR.PATCH`
(e.g. `v1.0.0`, `v2.3.1`, `v0.12.0-beta.1`).

---

## Merge conflict resolution

### Detection

```bash
# After a merge or rebase that conflicts:
git status  # Shows files with conflicts

# View the conflict markers
git diff
```

### Resolution process

1. Open each conflicting file. Conflicts are marked:
   ```
   <<<<<<< HEAD
   current branch content
   =======
   incoming branch content
   >>>>>>> feature/my-branch
   ```
2. Decide which version to keep (or combine both).
3. Remove all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
4. Stage the resolved file: `git add <file>`
5. Complete the merge: `git merge --continue` or `git rebase --continue`

### Decision rules for conflicts

| File type | Resolution approach |
|-----------|---------------------|
| Source code | Prefer the version that satisfies the tests. If unclear, keep both changes and fix conflicts logically. |
| Lock files (`package-lock.json`, `Cargo.lock`) | Delete and regenerate: `npm install` / `cargo update` |
| Config files | Merge carefully — both sets of config may be needed. |
| Changelog | Keep both sets of entries, sorted by date descending. |
| Version files | Use the higher version. |

---

## Safety rules

1. **Never force-push to `main` or `develop`.** Only force-push to personal feature
   branches, and only when you understand the consequences.
2. **Never rewrite history on shared branches.** Use `git revert` instead of
   `git reset --hard` on commits that others may have pulled.
3. **Confirm before destructive operations.** Before running `git reset --hard`,
   `git clean -fd`, or `git push --force`, verify the current branch and its remote
   tracking status with `git status` and `git log --oneline -5`.
4. **Do not commit secrets.** Check for accidental inclusion of `.env`, API keys,
   credentials, or private certificates before every commit.

---

## Discovery checklist

Before performing any git operation in an agent workflow:

- [ ] Run `git status` to confirm there are no unexpected uncommitted changes.
- [ ] Run `git branch` to confirm the current branch.
- [ ] Confirm the remote (`git remote -v`) to know where pushes go.
- [ ] Check `copilot-instructions.md` for any project-specific git conventions.
