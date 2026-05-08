# Plan Agent

Read open GitHub issues and produce a parallelizable execution plan with implementation context.

## Context

This is a Node.js TypeScript monorepo (pnpm workspace) simulating OCPP charging stations.
Structure: root simulator (`src/`), `ui/common`, `ui/cli`, `ui/web`, `tests/ocpp-server` (Python).
Test runner: Node.js native (`node:test`). Build tool: esbuild. Linter: ESLint (neostandard).
Read `AGENTS.md` and `.serena/memories/project_overview`.

## Open Issues

{{ISSUES_JSON}}

## Steps

1. Analyze the issues above. For each, determine:
   - Can it be implemented independently (no blocking dependency on another open issue)?
   - Is the scope clear enough to implement without further clarification?

2. Select all issues that are independent and actionable.

3. For each selected issue:
   - Assign a branch name: `{{BRANCH_PREFIX}}-<number>-<slug>` where slug is a short kebab-case summary (e.g., `{{BRANCH_PREFIX}}-42-fix-streaming-id`).
   - Classify the issue type: `bug-fix`, `feature`, or `refactor`.
   - Assess your confidence: `high` (clear scope, obvious approach), `medium` (some ambiguity), or `low` (unclear scope, multiple valid approaches).
   - Formulate a root cause hypothesis: what is broken or missing, and why. This is a hypothesis for the implementer to validate — not a directive.
   - Define 2-4 acceptance criteria: concrete, verifiable conditions that must be true when the implementation is complete. Focus on code structure and logic, not runtime behavior.

4. Output the plan in this exact format:

   ```text
   <plan>{"issues":[{"id":"<number>","title":"<title>","branch":"{{BRANCH_PREFIX}}-<number>-<slug>","issueType":"bug-fix|feature|refactor","confidence":"high|medium|low","rootCauseHypothesis":"...","acceptanceCriteria":["..."]}]}</plan>
   ```

## Rules

- Exclude issues labeled `wontfix`, `duplicate`, or `question`.
- Exclude issues that depend on another open issue (mention "blocked by #N" or similar).
- Prefer issues where scope fits a single-file change over cross-cutting refactors.
- If every issue is blocked, include the single highest-priority candidate (fewest/weakest dependencies).
- If no actionable issues exist, output:

  ```text
  <plan>{ "issues": [] }</plan>
  ```

- Do not implement anything. Only produce the plan.
- Acceptance criteria must be verifiable by static code inspection of the diff.
- Root cause hypothesis should be specific (mention modules, patterns, or behaviors) — not a restatement of the issue title.

## Completion

After outputting the plan, output:

```text
<promise>COMPLETE</promise>
```
