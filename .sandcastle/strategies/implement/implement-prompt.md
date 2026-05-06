# Implement Agent

Implement issue **#{{TASK_ID}}** ("{{ISSUE_TITLE}}") on branch `{{BRANCH}}`.

## Issue Details

{{ISSUE_BODY}}

## Review Findings

{{FINDINGS}}

## Exploration

Explore the repo to understand the architecture before coding. Pay attention to:

- Files related to the issue
- Test files touching relevant modules
- Existing patterns in similar code

Read `AGENTS.md`, `CONTRIBUTING.md`, `.serena/memories/code_style_conventions` and `.serena/memories/task_completion_checklist`.

## Implementation

1. If review findings are provided above, cross-validate each one against the code. Fix findings you agree with. Ignore findings that are incorrect or not applicable.

2. If no findings are provided, implement the issue from scratch following existing patterns:
   - Strict TypeScript, no `any`/`@ts-ignore`
   - Use existing error classes (BaseError, OCPPError)
   - Follow existing naming conventions (camelCase functions, PascalCase classes/types)
   - Tests use Node.js native test runner (`node:test` + `node:assert`)

3. Before every commit, run the quality gates for the affected sub-project(s):

   ```bash
   pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test
   ```

   If changes affect `ui/web`:

   ```bash
   cd ui/web && pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test:coverage
   ```

   If changes affect `ui/cli`:

   ```bash
   cd ui/cli && pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test
   ```

4. Commit with conventional commits:
   - `fix: <description>` — bug fix
   - `feat: <description>` — new feature
   - `refactor: <description>` — restructuring
   - `chore: <description>` — tooling/config

5. Push the branch:

   ```bash
   git push -u origin {{BRANCH}}
   ```

## Rules

- One logical change per commit.
- Tests must pass before pushing. Zero type errors, zero test failures.
- Do not modify unrelated files.
- Do not bump version numbers.
- Push BEFORE signaling completion.

## Completion

When validation passes and the branch is pushed, output:

```text
<promise>COMPLETE</promise>
```
