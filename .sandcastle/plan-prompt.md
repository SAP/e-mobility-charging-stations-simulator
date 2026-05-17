# Plan Agent

Read open GitHub issues and produce a parallelizable execution plan with implementation context.

## Context

This is a Node.js TypeScript monorepo (pnpm workspace) simulating OCPP charging stations.
Structure: root simulator (`src/`), `ui/common`, `ui/cli`, `ui/web`, `tests/ocpp-server` (Python).
Test runner: Node.js native (`node:test`). Build tool: esbuild. Linter: ESLint (neostandard).
Read `AGENTS.md` and `.serena/memories/project_overview`.

## Open Issues

Each issue has been pre-resolved to a strategy (`strategyKey`) and the matching
git branch prefix (`branchPrefix`). You MUST preserve both verbatim in your plan
output for the corresponding issue.

{{ISSUES_JSON}}

## Steps

1. Analyze the issues above. For each, determine:
   - Can it be implemented independently (no blocking dependency on another open issue)?
   - Is the scope clear enough to implement without further clarification?

2. Select all issues that are independent and actionable.

3. For each selected issue:
   - Assign a branch name: `<branchPrefix>-<number>-<slug>` where `<branchPrefix>` is the value
     provided for that issue and `<slug>` is a short kebab-case summary
     (e.g., for an issue with `branchPrefix: "agent/implement"` and number 42:
     `agent/implement-42-fix-streaming-id`).
   - Echo the issue's `strategyKey` verbatim in the output.
   - Classify the issue type: `bug-fix`, `feature`, or `refactor`.
   - Assess your confidence: `high` (clear scope, obvious approach), `medium` (some ambiguity), or `low` (unclear scope, multiple valid approaches).
   - Formulate a root cause hypothesis: what is broken or missing, and why. This is a hypothesis for the implementer to validate — not a directive.
   - Define 2-4 acceptance criteria: concrete, verifiable conditions that must be true when the implementation is complete. Focus on code structure, algorithmic and logic, not runtime behavior.

4. Output the plan in this exact format:

   ```text
   <plan>{"issues":[{"id":"<number>","title":"<title>","branch":"<branchPrefix>-<number>-<slug>","strategyKey":"<strategyKey>","issueType":"bug-fix|feature|refactor","confidence":"high|medium|low","rootCauseHypothesis":"...","acceptanceCriteria":["..."]}]}</plan>
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
- Do not invent a `strategyKey` or override `branchPrefix`: copy the values provided per issue.

## Completion

After outputting the plan, output:

```text
<promise>COMPLETE</promise>
```
