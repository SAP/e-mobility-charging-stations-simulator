# Plan

Read open GitHub issues and produce a parallelizable execution plan.

## Inputs

- `ISSUES_JSON` — JSON array of open issues, each entry `{ number, title, body, labels }`.

{{ISSUES_JSON}}

## Task

1. Read `AGENTS.md` and `.serena/memories/project_overview` for repository context.
2. For each issue, decide whether it is independently actionable: scope is clear and there is no blocking dependency on another open issue.
3. Drop issues labelled `wontfix`, `duplicate`, or `question`, or blocked by another open issue. If every issue is blocked, keep only the highest-priority candidate.
4. For each kept issue, derive:
   - `id`: the issue number as a string.
   - `slug`: a short kebab-case summary of the change matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` (≤ 40 chars).
   - `title`: the issue title.
   - `issueType`: `bug-fix`, `feature`, or `refactor`.
   - `confidence`: `high` (clear scope), `medium` (some ambiguity), or `low` (unclear scope).
   - `rootCauseHypothesis`: a specific hypothesis (modules, patterns, behaviours) for the implementer to validate — not a restatement of the title.
   - `acceptanceCriteria`: 2–4 conditions verifiable by static inspection of the diff (code structure, logic, algorithms — not runtime behaviour).
5. Do not implement anything; output only the plan.

## Output

```text
<plan>{"issues":[{"id":"<number>","slug":"<kebab-slug>","title":"<title>","issueType":"bug-fix|feature|refactor","confidence":"high|medium|low","rootCauseHypothesis":"...","acceptanceCriteria":["..."]}]}</plan>
```

When no issue is actionable: `<plan>{"issues":[]}</plan>`.

## Rules

- Prefer single-file scope over cross-cutting refactors.

## Done

<promise>COMPLETE</promise>
