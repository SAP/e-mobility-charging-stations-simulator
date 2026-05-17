# Actor

Implement issue **#{{ISSUE_NUMBER}}** ("{{ISSUE_TITLE}}") on branch `{{BRANCH}}`, or address review findings if present.

## Inputs

- `ISSUE_NUMBER` — GitHub issue number.
- `ISSUE_TITLE` — issue title.
- `BRANCH` — working branch, already checked out.
- `ISSUE_BODY` — sanitised issue body.
- `PLAN_CONTEXT` — optional planner analysis (hypothesis, acceptance criteria); empty when absent.
- `FINDINGS` — optional JSON array of critic findings from the previous round; empty on the first round.

{{ISSUE_BODY}}

{{PLAN_CONTEXT}}

{{FINDINGS}}

## Task

1. Read `AGENTS.md`, `CONTRIBUTING.md`, `.serena/memories/code_style_conventions`, and `.serena/memories/task_completion_checklist`. Explore files surrounding the issue and similar patterns in the repo.
2. If `FINDINGS` is non-empty, cross-validate each finding against the code; fix the ones you agree with, ignore the rest.
3. Otherwise implement the issue end-to-end, including matching tests using `node:test` + `node:assert`.
4. Before every commit, run the full quality-gate chain in every affected sub-project. Root-level chain:

   ```bash
   pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test
   ```

   For changes inside `ui/web` or `ui/cli`, run the same chain in that directory (substitute `pnpm test:coverage` for `pnpm test` in `ui/web`).

5. Commit one logical change at a time using Conventional Commits (`fix:`, `feat:`, `refactor:`, `chore:`).
6. Push the branch:

   ```bash
   git push -u origin {{BRANCH}}
   ```

## Output

Commits on `{{BRANCH}}` pushed to `origin`. No structured stdout payload.

## Rules

- Strict TypeScript: no `any`, no `@ts-ignore`, no non-null `!`; use the existing typed errors (`BaseError`, `OCPPError`).
- Do not modify unrelated files; do not bump version numbers.
- Push before signaling completion; HEAD must have zero type errors and zero test failures.

## Done

<promise>COMPLETE</promise>
