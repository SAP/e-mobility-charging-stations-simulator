# Parallel Task Decomposition for Sandcastle

## Problem Statement

Currently, sandcastle processes each GitHub issue as a single unit of work assigned to one agent. For complex issues requiring changes across multiple files/modules, a single agent must handle everything sequentially. This limits throughput and doesn't leverage the natural parallelism in multi-file changes.

## Goal

Enable the planner to decompose a single issue into independent sub-tasks, execute them in parallel across isolated git worktrees, then merge and validate the combined result.

## Requirements

### R1: Decomposition

- R1.1: The planner MUST produce a DAG of sub-tasks per issue (not just a flat list).
- R1.2: Each sub-task MUST declare its file ownership (which files/directories it will modify).
- R1.3: Sub-tasks with no mutual file overlap and no data dependency MAY execute in parallel.
- R1.4: Sub-tasks with overlapping files or data dependencies MUST be ordered sequentially.
- R1.5: Shared files (package.json, tsconfig.json, index.ts barrels, type definitions) MUST be reserved for a dedicated integration sub-task that runs after all parallel sub-tasks complete.
- R1.6: The decomposition MUST include a confidence score. Below a threshold, fall back to single-agent sequential execution.

### R2: Isolation

- R2.1: Each parallel sub-task MUST execute in its own git worktree branched from the issue branch.
- R2.2: Sub-task branches MUST follow the naming convention `{issue-branch}/sub-{n}-{slug}`.
- R2.3: The sandbox Docker container MUST be dedicated per sub-task (no shared mutable state).

### R3: Execution

- R3.1: Parallel sub-tasks within the same wave MUST execute concurrently (Promise.all or equivalent).
- R3.2: The maximum number of parallel sub-task agents per issue MUST be configurable (default: 3).
- R3.3: Each sub-task agent MUST receive only its assigned file ownership scope in its prompt.
- R3.4: Each sub-task agent MUST run the implement↔critic refinement loop independently.
- R3.5: The abort signal from the parent task MUST propagate to all sub-task agents.
- R3.6: If any sub-task fails, the system MUST continue with remaining sub-tasks (partial success is acceptable).

### R4: Merge

- R4.1: Sub-task branches MUST merge sequentially into the issue branch (git index is not concurrency-safe).
- R4.2: Before merging, all sub-task branches MUST be analyzed for conflict likelihood (git merge-tree simulation).
- R4.3: Branches MUST merge in order of lowest conflict likelihood first.
- R4.4: On merge conflict, an AI resolver agent MUST attempt resolution using 3-way merge context (base/ours/theirs).
- R4.5: On resolution failure, the conflicting branch MUST be skipped (not block remaining merges).
- R4.6: A backup tag MUST be created before each merge for rollback capability.

### R5: Integration

- R5.1: After all parallel sub-tasks merge, the integration sub-task (R1.5) MUST run to update shared files.
- R5.2: After integration, the full validation suite MUST pass (same as current single-agent flow).
- R5.3: If validation fails post-merge, a repair agent MUST attempt fixes (max 2 attempts).
- R5.4: If repair fails, the system MUST roll back to the backup tag and fall back to single-agent execution.

### R6: Observability

- R6.1: Each sub-task MUST log independently to `.sandcastle/logs/{issue}-sub-{n}.log`.
- R6.2: The merge phase MUST log conflict details and resolution outcomes.
- R6.3: The final PR description MUST indicate which sub-tasks succeeded/failed and list the merge order.

## Non-Requirements (out of scope)

- N1: Multiple agents working on the SAME files simultaneously (CRDT-based) — too complex, empirically 5-10% semantic conflict rate.
- N2: Human-in-the-loop during merge — sandcastle is fully autonomous.
- N3: Best-of-N sampling for the same sub-task — orthogonal concern, can be added later.
- N4: Cross-issue dependencies between sub-tasks — sub-tasks are scoped to a single issue.

## Constraints

- C1: Maximum 3-5 parallel sub-task agents per issue (empirically validated ceiling).
- C2: The feature MUST be opt-in via planner confidence score — simple issues skip decomposition.
- C3: Total wall-clock time for a decomposed issue MUST NOT exceed 2× the single-agent timeout.
- C4: The existing single-agent flow MUST remain the default for issues that don't benefit from decomposition.

## References

- MASAI (NeurIPS 2024): Role-functional decomposition with per-agent strategy tuning
- CodeCRDT (Oct 2025): Empirical study — 3-5 agents optimal, beyond that coordination overhead dominates
- ralph-tui: Topological sort + wave scheduling + AI 3-way conflict resolution
- ralphy: Conflict-likelihood sorting before sequential merge
- BATS (2025): Budget-aware test-time scaling with dynamic effort allocation
- Plan-over-Graph (Feb 2025): DAG-based parallel schedule generation from task decomposition
