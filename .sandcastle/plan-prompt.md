# Plan Agent

Read open GitHub issues and produce a parallelizable execution plan.

## Context

This is a Node.js TypeScript monorepo (pnpm workspace) simulating OCPP charging stations.
Structure: root simulator (`src/`), `ui/common`, `ui/cli`, `ui/web`, `tests/ocpp-server` (Python).
Test runner: Node.js native (`node:test`). Build tool: esbuild. Linter: ESLint (neostandard).
Read `AGENTS.md` for project conventions.

## Open Issues

{{ISSUES_JSON}}

## Steps

1. Analyze the issues above. For each, determine:
   - Can it be implemented independently (no blocking dependency on another open issue)?
   - Is the scope clear enough to implement without further clarification?

2. Select all issues that are independent and actionable.

3. For each selected issue, assign a branch name: `{{BRANCH_PREFIX}}-<number>-<slug>` where slug is a short kebab-case summary (e.g., `{{BRANCH_PREFIX}}-42-fix-streaming-id`).

4. Output the plan in this exact format:

   ```text
   <plan>{ "issues": [{ "id": "<number>", "title": "<title>", "branch": "{{BRANCH_PREFIX}}-<number>-<slug>" }] }</plan>
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

## Completion

After outputting the plan, output:

```text
<promise>COMPLETE</promise>
```
