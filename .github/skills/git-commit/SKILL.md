---
name: git-commit
description: 'Create git commits with semantic-release compatible Conventional Commit messages. Use when: committing changes, writing commit messages, staging files, creating release-triggering commits, making fix/feat/chore/refactor/test/docs commits, or handling breaking changes.'
argument-hint: 'Describe the change to commit, or say what files to include'
---

# Git Commit

Use this skill when the user asks to create a git commit, write a commit message, stage changes for a commit, or decide how a change should be represented in git history.

## Commit Message Requirement

Every commit message must be semantic-release compatible by following the Conventional Commits format:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

Use lowercase commit types. Prefer these types unless the repository has a documented alternative:

- `feat`: user-visible feature; triggers a minor release in the default semantic-release setup
- `fix`: user-visible bug fix; triggers a patch release in the default semantic-release setup
- `perf`: performance improvement; may trigger a patch release depending on release rules
- `docs`: documentation-only change
- `test`: test-only change
- `refactor`: code change that neither fixes a bug nor adds a feature
- `style`: formatting-only change with no behavior change
- `build`: build system or dependency change
- `ci`: continuous integration change
- `chore`: maintenance change that does not affect runtime behavior
- `revert`: revert of a previous commit

The description must be concise, imperative, and lowercase after the type unless it contains a proper noun or code identifier. Do not end the subject with a period.

Examples:

```text
feat(editor): add page duplication control
fix(api): preserve export filenames
chore(deps): update vite
```

## Breaking Changes

For a breaking change, always mark it in a semantic-release compatible way:

```text
feat(api)!: require authenticated export requests

BREAKING CHANGE: Export endpoints now require a valid session token.
```

Use both `!` in the header and a `BREAKING CHANGE:` footer when the change is intentionally breaking. The footer text should explain what changed and what consumers must do.

## Commit Workflow

1. Inspect the worktree with `git status --short` and review the relevant diff before staging.
2. Stage only files that belong to the requested change. Never include unrelated user changes just because they are present.
3. If unrelated changes are mixed into a file that must be committed, ask the user before using patch staging or splitting the commit.
4. Choose the commit type from the actual user-facing effect, not from the implementation detail.
5. Add a scope when it improves clarity, such as `editor`, `api`, `exports`, `deps`, or `docs`.
6. Use `feat` or `fix` for changes that should normally produce semantic-release notes. Use `chore`, `refactor`, `test`, or `docs` for non-release changes unless repository release rules say otherwise.
7. Before committing, show or state the exact commit message that will be used.
8. Create the commit with quoted `git commit -m` arguments. For multi-paragraph messages, use multiple `-m` flags so the body and footers remain separate paragraphs.

## Message Selection Guide

Ask these questions before choosing the type:

- Does this add a user-visible capability? Use `feat`.
- Does this correct broken behavior? Use `fix`.
- Does this only reorganize code without behavior changes? Use `refactor`.
- Does this only update tests? Use `test`.
- Does this only update documentation? Use `docs`.
- Does this change tooling, package metadata, or routine maintenance? Use `chore`, `build`, or `ci` as appropriate.

If a change could fit multiple types, choose the type that best describes the observable effect that semantic-release should communicate.

## Guardrails

- Do not create a commit unless the user explicitly asks for one.
- Do not bypass hooks with `--no-verify` unless the user explicitly requests it.
- Do not amend, squash, rebase, reset, or force push unless the user explicitly requests it.
- Do not use non-Conventional Commit subjects such as `Update files`, `WIP`, `misc changes`, or `fix stuff`.
- Do not invent a breaking-change footer for non-breaking changes.
