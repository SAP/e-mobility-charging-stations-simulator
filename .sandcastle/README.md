# `.sandcastle/` — Actor↔critic refinement loop

> Task-agnostic refinement kernel. Tasks are inputs; **the loop is the product.** Plug in a `LoopStrategy` and the kernel handles round budgeting, critic voting, deduplication, regression rollback, and post-loop validation.

## What it is

`.sandcastle/` is an internal orchestrator that runs an **iterative actor↔critic loop** over GitHub issues, in a per-task ephemeral Docker sandbox provided by [`@ai-hero/sandcastle`](https://www.npmjs.com/package/@ai-hero/sandcastle).

The kernel modules ([`refinement-loop.ts`](./refinement-loop.ts), [`merge-findings.ts`](./merge-findings.ts), [`concurrency-pool.ts`](./concurrency-pool.ts), [`finalizer.ts`](./finalizer.ts), [`validation.ts`](./validation.ts)) **do not import any strategy.** Strategies are pluggable: each declares prompts, prompt-arg builders, and a finalization step (push + PR creation, in the default `implement` strategy). Adding a new task type — review, migration, benchmark generation, etc. — is one strategy entry, not a kernel change.

Today the registry contains exactly one strategy ([`implement`](./strategies/implement/)) — resolve a labelled issue into a draft/ready PR. The kernel runs unchanged for any future strategy.

## How it works

```
                  ┌──────────────── per task, in parallel up to MAX_PARALLEL ─────────────────┐
                  │                                                                             │
GitHub issues ──▶ Planner ──▶ TaskSpec ──▶ Sandbox ──▶  ┌──────── refinement loop ────────┐ ──▶ Strategy.finalize
  (labels)        agent                    (Docker)     │                                  │   (rebase, push, PR)
                                                        │  Actor ──draft──▶ N critics      │
                                                        │   ▲   commits     │ findings     │
                                                        │   │  ◀────── voted merge ────────│
                                                        │   │     dedup (file::cat::ctx)   │
                                                        │   │     median tie-up severity   │
                                                        │   └── arbiter (opt-in, MoA) ◀────│
                                                        │                                  │
                                                        │  per round: validate?            │
                                                        │  per round: quality ratchet      │
                                                        │  on regression: rollback to BEST │
                                                        │  on convergence: break           │
                                                        └──────────────────────────────────┘
                                                              up to AGENT_MAX_CRITIC_ROUNDS
```

## Lifecycle (per nightly run)

1. **Discovery** ([`task-source.ts`](./task-source.ts)) — `GithubIssueSource.discover()` lists open issues carrying any `sandcastle-<key>` label, drops issues already covered by an open PR, then runs the **planner agent** ([plan-prompt.md](./plan-prompt.md)) to emit a JSON plan: `{id, slug, title, issueType, confidence, rootCauseHypothesis, acceptanceCriteria}` per issue. Output is parsed via Zod, retried up to 5× on schema mismatch, and assigned a `branch = agent/<key>-<id>-<slug>`.
2. **Fan-out** ([`main.ts`](./main.ts)) — each `TaskSpec` runs through `ConcurrencyPool` (cap `MAX_PARALLEL = 5`) with a per-task timeout (`AGENT_TASK_TIMEOUT_MS = 30 000 000 ms ≈ 8.3 h`). Each task gets its own sandbox via `sandcastle.createSandbox`.
3. **Refinement loop** ([`refinement-loop.ts`](./refinement-loop.ts)) — runs `runRefinementLoop(spec, sandbox, strategy, opts)`. Each round:
   1. **Actor** drafts code: one agent invocation up to `iterationBudget = 50` tool iterations.
   2. **Critic ensemble** reviews the diff in parallel: N slots resolved from `criticPool`, where `N = strategy.criticCount ?? max(AGENT_CRITIC_COUNT, criticPool.length)` (so a strategy that ships only a longer pool gets `N = pool.length`). Up to `MAX_CRITIC_COUNT = 8`. `Promise.allSettled` over all slots; per-slot one parse-retry; quorum `⌈N/2⌉`.
   3. **Voted merge** ([`mergeCriticFindings`](./merge-findings.ts)) deduplicates findings across critics by `${file}::${normalizeCategory(category)}::${ctxHash(line, ±3)}`; aggregates severity/confidence by median-tie-up; emits `votes`/`voters`/`disagreementScore`.
   4. **Optional arbiter** (MoA stage-2) synthesizes HIGH/CRITICAL findings when `strategy.arbiter` is set; failure non-fatal.
   5. **Per-round validation** (`strategy.validate ?? runValidation`) — defaults to `pnpm -r format && pnpm -r typecheck && pnpm -r lint && pnpm -r build && pnpm -r test`. On pass with `commits > 0`: converged.
   6. **Quality ratchet**: if non-LOW finding count rose vs. previous round (and round ≥ 3), rollback worktree to `beforeSha`.
   7. **Convergence**: empty new findings AND no persistent CRITICAL/HIGH ⇒ converged.
   8. **Best-state restore**: track the SHA at the round with fewest non-LOW findings; on non-converged exit, reset to it.
4. **Post-loop validation retry** (when `postLoopValidationRetry: true`) — if the loop ended non-converged but `totalCommits > 0`, run validation once more; if it passes, mark `converged`; otherwise spend one more actor round.
5. **Finalization** ([`strategies/implement/strategy.ts`](./strategies/implement/strategy.ts) + [`finalizer.ts`](./finalizer.ts)) — `attemptRebase` onto base; `pushBranch` (force-with-lease on rebase success, rescue branch on failure); `gh pr create` (draft when non-converged or validation failed; full PR otherwise) with severity-tagged outstanding findings.

## Module map

| File                                               | Purpose                                                                                                                           | Strategy-aware? |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| [`main.ts`](./main.ts)                             | Entrypoint. Discovers tasks, fans out under `ConcurrencyPool`, dispatches to strategy via `STRATEGY_BY_KEY`.                      | ✓               |
| [`refinement-loop.ts`](./refinement-loop.ts)       | Implement↔critic loop kernel: rounds, convergence, ratchet, best-state, post-loop retry.                                          | ✗               |
| [`merge-findings.ts`](./merge-findings.ts)         | Pure module: slot resolution, cross-critic dedup, voted merge with median tie-up, disagreement scoring.                           | ✗               |
| [`concurrency-pool.ts`](./concurrency-pool.ts)     | O(1) FIFO concurrency limiter (singly-linked queue).                                                                              | ✗               |
| [`task-source.ts`](./task-source.ts)               | GitHub issue discovery, planner agent invocation, branch policy, prompt-injection sanitization.                                   | ✓               |
| [`finalizer.ts`](./finalizer.ts)                   | `attemptRebase`, `pushBranch` (with rescue branch), `buildPrArgs`.                                                                | ✗               |
| [`validation.ts`](./validation.ts)                 | Default work-quality validation runner (`pnpm -r format && pnpm -r typecheck && pnpm -r lint && pnpm -r build && pnpm -r test`).  | ✗               |
| [`strategies/index.ts`](./strategies/index.ts)     | Canonical `STRATEGY_REGISTRY`. Validates every strategy at module load (key pattern, control tags, agent specs, ensemble fields). | n/a             |
| [`strategies/implement/`](./strategies/implement/) | Default strategy: actor + critic prompts + finalize (rebase, push, `gh pr create`).                                               | n/a             |
| [`types.ts`](./types.ts)                           | Shared types: `LoopStrategy`, `AgentSpec`, `CriticSlot`, `Finding`, `RoundSnapshot`, `TaskSpec`.                                  | n/a             |
| [`constants.ts`](./constants.ts)                   | Canonical defaults: agent specs, model providers, timeouts, sandbox hooks, validation command.                                    | n/a             |

## Core concepts

| Term                | Type            | Meaning                                                                                                                                                                        |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`TaskSpec`**      | input           | A single unit of work: id, branch, body, plan metadata. Strategy-agnostic.                                                                                                     |
| **`LoopStrategy`**  | extension point | Declares `actorPromptFile`, `criticPromptFile`, `buildActorArgs`, `buildCriticArgs`, optional agent overrides, optional `validate`, optional `shouldConverge`.                 |
| **`AgentSpec`**     | value object    | The canonical `{ model, effort }` pair. Required for actor, every critic-pool entry, arbiter, and planner.                                                                     |
| **`CriticSlot`**    | resolved        | `AgentSpec` + zero-based `index`. Produced by `resolveCriticSlots(strategy)`.                                                                                                  |
| **`Finding`**       | output          | A single critic observation: `{file, line?, severity, confidence, category, title, description, suggestion?}` plus post-merge `{votes, voters, disagreementScore, contested}`. |
| **`RoundSnapshot`** | telemetry       | Per-round record: `{round, commits, findings, status, validCriticCount?}`.                                                                                                     |
| **`LoopResult`**    | output          | `{baseBranch, status, totalCommits, roundsCompleted, roundHistory, failureReason?}`.                                                                                           |
| **`StrategyEntry`** | registry record | `{key, strategy, controlTags?}`. Derives label `sandcastle-<key>` and branch prefix `agent/<key>`.                                                                             |

## Adding a new strategy

The kernel is unchanged. Adding `<key>` is 4 steps:

1. Create `strategies/<key>/strategy.ts` exporting `<key>Strategy: FinalizationConfig & LoopStrategy`. Provide `actorPromptFile`, `criticPromptFile`, `buildActorArgs`, `buildCriticArgs`, `finalize`, `isWorkComplete`. Optionally override `actor`, `criticPool`, `arbiter`, `validate`, `shouldConverge`.
2. Add prompts: `strategies/<key>/actor-prompt.md` and `strategies/<key>/critic-prompt.md`. Both receive a unique `NONCE` placeholder used for findings extraction.
3. Register: append `{ key: '<key>', strategy: <key>Strategy, controlTags?: ['…'] }` to `STRATEGY_REGISTRY` in [`strategies/index.ts`](./strategies/index.ts).
4. Apply the GitHub label `sandcastle-<key>` to issues you want this strategy to pick up.

The kernel pattern enforces:

- `<key>` is kebab-case, doesn't overlap an existing key (validated at module load).
- `STRATEGY_REGISTRY` order matters: when an issue carries multiple `sandcastle-*` labels, the **first** entry wins.
- `controlTags` are stripped from issue text before reaching agents — defense against prompt injection.

## Multi-critic ensemble

A critic phase runs **N parallel critic agents** drawn from `strategy.criticPool`. Each is an `AgentSpec` (model + effort, atomically paired). Slots fill via:

- **Round-robin** (default): cyclic `pool[i % L]` when `criticCount > pool.length`.
- **Random with replacement**: seeded sampling via `criticEnsembleSeed`. Reproducible across runs.

Findings merge with majority voting (default threshold `⌈valid/2⌉`). One **escape hatch**: a finding flagged by exactly one critic with `severity=CRITICAL` AND `confidence=HIGH` survives, but is capped at `HIGH` and tagged `contested = true`. Optional **stage-2 arbiter** (MoA pattern, [arXiv:2406.04692](https://arxiv.org/abs/2406.04692)) refines HIGH/CRITICAL findings when `strategy.arbiter` is set; arbiter failure is non-fatal.

Failure mode catch: when fewer than `⌈N/2⌉` slots return parseable findings, the round is marked `critic_errored` and not merged. The simple-majority quorum is calibrated for crash-fault tolerance — LLM critics fail by parse error / timeout / OOM, not adversarially, so BFT thresholds are unwarranted.

**Industry-norm divergence (D2)**: SAST tooling conventionally aggregates severity by **MAX** (CVSS v3.1 §3.8; GitHub/GHAS; DefectDojo). This module uses **median tie-up** because LLM critics are stochastic and miscalibrated; median is robust to outlier critics. The singleton-CRITICAL escape hatch covers the asymmetric-cost case.

## Robustness mechanisms

| Mechanism                      | Where                                                            | Trigger                                                                  | Action                                                                 |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Quality ratchet**            | [`refinement-loop.ts:checkQualityRatchet`](./refinement-loop.ts) | Round ≥ 3 AND non-LOW findings rose                                      | `git reset --hard` to `beforeSha`, mark loop `exhausted`               |
| **Best-state restore**         | [`refinement-loop.ts:resetToBestState`](./refinement-loop.ts)    | Loop ends non-converged AND a better intermediate SHA was captured       | Reset worktree to that SHA, recount commits vs. base                   |
| **Critic parse retry**         | [`refinement-loop.ts:runOneCritic`](./refinement-loop.ts)        | Per-slot: `parseFindings` returns `null`                                 | One re-invocation with the same nonce                                  |
| **Critic quorum gate**         | [`refinement-loop.ts:runCritic`](./refinement-loop.ts)           | `validCount < ⌈N/2⌉`                                                     | Round = `critic_errored`, no merge, no rollback                        |
| **Mid-loop validation**        | `strategy.validate`                                              | After actor commits in a round                                           | Pass + `commits > 0` ⇒ `converged` and break                           |
| **Post-loop validation retry** | [`refinement-loop.ts:runRefinementLoop`](./refinement-loop.ts)   | `postLoopValidationRetry: true` AND non-converged AND `totalCommits > 0` | One extra actor round if validation fails                              |
| **Push rescue branch**         | [`finalizer.ts:pushBranch`](./finalizer.ts)                      | `git push --force-with-lease` fails post-rebase                          | Push to `rescue/<branch>-<random>` so commits survive sandbox disposal |
| **Sandbox abort**              | [`main.ts`](./main.ts)                                           | `AGENT_TASK_TIMEOUT_MS` reached                                          | `AbortController.abort()` propagated to all in-flight agents           |

## Configuration

### Canonical agent defaults ([`constants.ts`](./constants.ts))

| Constant                    | Role                                      | Used by                                                              |
| --------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `AGENT_ACTOR_DEFAULT`       | Implementer                               | `runRefinementLoop` when `LoopStrategy.actor` is unset               |
| `AGENT_CRITIC_POOL_DEFAULT` | Critic pool (non-empty `AgentSpec` tuple) | `resolveCriticSlots` when `LoopStrategy.criticPool` is unset         |
| `AGENT_ARBITER_DEFAULT`     | Stage-2 synthesis                         | Strategy-supplied via `arbiter.agent` (spread for canonical default) |
| `AGENT_PLANNER_DEFAULT`     | Issue triage / acceptance criteria        | `task-source.ts` planner step                                        |

All four are `AgentSpec` shaped: `{ effort: 'low'|'medium'|'high'; model: string }`. The right effort is a property of the model — required, not inferred.

### Loop tunables ([`constants.ts`](./constants.ts))

| Constant                       | Default                                                                                | Purpose                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_CRITIC_COUNT`           | `1`                                                                                    | Floor for default slot count. Effective default when `LoopStrategy.criticCount` is unset is `max(AGENT_CRITIC_COUNT, criticPool.length)`. |
| `MAX_CRITIC_COUNT`             | `8`                                                                                    | Hard cap, enforced at registry load                                                                                                       |
| `CRITIC_AGREEMENT_FRACTION`    | `0.5`                                                                                  | Default threshold (simple majority)                                                                                                       |
| `CRITIC_FILL_STRATEGY_DEFAULT` | `'round-robin'`                                                                        | Slot fill when `criticCount > criticPool.length`                                                                                          |
| `AGENT_ITERATION_BUDGET`       | `50`                                                                                   | Per-round actor tool-iteration cap                                                                                                        |
| `AGENT_MAX_CRITIC_ROUNDS`      | `10`                                                                                   | Hard cap on round count                                                                                                                   |
| `AGENT_IDLE_TIMEOUT_S`         | `720`                                                                                  | Per-agent idle timeout                                                                                                                    |
| `AGENT_TASK_TIMEOUT_MS`        | `30 000 000`                                                                           | Whole-task wall-clock budget (~8.3 h)                                                                                                     |
| `MAX_PARALLEL`                 | `5`                                                                                    | Concurrent task cap                                                                                                                       |
| `CONTEXT_HASH_RADIUS`          | `3`                                                                                    | Lines above/below the finding line included in dedup hash                                                                                 |
| `VALIDATION_COMMAND`           | `pnpm -r format && pnpm -r typecheck && pnpm -r lint && pnpm -r build && pnpm -r test` | Default `validate` implementation                                                                                                         |
| `VALIDATION_TIMEOUT_MS`        | `900 000`                                                                              | 15 min cap on validation runs                                                                                                             |

### Environment variables (sandbox runtime)

| Variable                | Required                             | Purpose                                            |
| ----------------------- | ------------------------------------ | -------------------------------------------------- |
| `GH_TOKEN`              | yes                                  | GitHub API + `gh` CLI auth (read issues, open PRs) |
| `GITHUB_TOKEN`          | yes                                  | Same; some sub-steps key off this name             |
| `PI_AUTH_CONTENT`       | when `AGENT_PROVIDER === 'pi'`       | Auth blob mounted at `~/.pi/agent/auth.json`       |
| `OPENCODE_AUTH_CONTENT` | when `AGENT_PROVIDER === 'opencode'` | OpenCode auth                                      |

The CI workflow ([`.github/workflows/sandcastle.yml`](../.github/workflows/sandcastle.yml)) writes a `.sandcastle/.env` file from secrets at runtime; that file feeds the Docker sandbox.

## Sandboxing

Every task runs in a **fresh Docker container** built from [`Dockerfile`](./Dockerfile) (Node.js 24, git, GitHub CLI, uv, three coding-agent CLIs). The lifecycle:

1. `sandcastle.createSandbox({ branch, hooks, sandbox: docker(...) })` checks out a branch worktree inside the container.
2. `SANDBOX_BUILD_HOOKS.onSandboxReady` runs `pnpm install && pnpm run build` once the container is up.
3. `SANDBOX_AUTH_HOOKS` writes the agent provider auth file from `$PI_AUTH_CONTENT` / `$OPENCODE_AUTH_CONTENT`.
4. The pnpm store is bind-mounted read-only from host (when present) to skip duplicate installs.
5. On `await using` scope exit, the sandbox is torn down — including any uncommitted/unpushed changes (which is why `finalizer.pushBranch` has the rescue-branch fallback).

## Running

```sh
# Local: read GH issues, plan, run loops in sequence.
# Requires `.sandcastle/.env` with the variables above.
pnpm sandcastle

# CI: scheduled cron at 22:00 UTC daily, plus manual `workflow_dispatch`.
# See .github/workflows/sandcastle.yml.
```

## Testing

Sandcastle tests live next to the module they exercise, under [`.sandcastle/tests/`](./tests/), and are run by a dedicated script — deliberately separate from the repo-wide `pnpm test` so the orchestrator's test suite stays self-contained:

```sh
# Pure unit tests (slot resolution, voted merge, registry validation):
pnpm test:sandcastle

# Same with coverage report at .sandcastle/coverage/lcov.info:
pnpm test:sandcastle:coverage

# Same under the Node inspector:
pnpm test:sandcastle:debug
```

41 unit tests cover backward-compat single-critic identity, round-robin / seeded-random slot fill, severity median tie-up, cross-critic dedup with category-phrasing variance, singleton-CRITICAL escape with HIGH cap, disagreement scoring, and registry-load validation (one case per fail-fast rule).

## Using with AI coding agents

When extending `.sandcastle/` with Copilot / Claude / Cursor:

- **Canonical extension point: a new `LoopStrategy`.** Don't modify the kernel — it has zero strategy-specific code, and reviewers will reject changes that couple it to a task type.
- **Agent specs are atomic.** When tweaking models or efforts, edit a single `AgentSpec` literal — never split the (model, effort) pair.
- **Validation is fail-fast at module load.** Misconfiguration (empty pool, blank model, invalid effort, threshold OOB, missing seed for random fill) throws with a field-named error in [`strategies/index.ts:validateLoopStrategyEnsemble`](./strategies/index.ts) — read the error, fix the field.
- **Prompts are XML-tag-delimited.** The actor/critic/arbiter outputs are extracted from `<promise>COMPLETE</promise>` and per-call `<findings-{NONCE}>...</findings-{NONCE}>` markers; preserve these in any new prompts.

## References

The design draws on (citations are inline in code comments where applicable):

- **Mixture-of-Agents** ([Wang et al. 2024, arXiv:2406.04692](https://arxiv.org/abs/2406.04692)) — stage-2 arbiter pattern.
- **Self-Consistency** ([Wang et al. 2022, arXiv:2203.11171](https://arxiv.org/abs/2203.11171)) — N-sample voting; rationale for `MAX_CRITIC_COUNT = 8`.
- **Panel of LLM Evaluators (PoLL)** ([Verga et al. 2024, arXiv:2404.18796](https://arxiv.org/abs/2404.18796)) — heterogeneous-pool advantage; recommended N=3.
- **LLM-as-a-Judge biases** ([Zheng et al. 2023, arXiv:2306.05685](https://arxiv.org/abs/2306.05685)) — verbosity-bias rationale for "lowest-slot voter wins" tie-break.
- **Calibration of LLM confidence** ([Kadavath et al. 2022, arXiv:2207.05221](https://arxiv.org/abs/2207.05221)) — rationale for preferring `disagreementScore` over textual confidence.
- **Practical Byzantine Fault Tolerance** ([Castro & Liskov, OSDI 1999](https://pmg.csail.mit.edu/papers/osdi99.pdf)) — quorum-threshold rationale (CFT, not BFT).
- **DefectDojo deduplication** ([`dojo/finding/deduplication.py`](https://github.com/DefectDojo/django-DefectDojo/blob/master/dojo/finding/deduplication.py)) — hash-based dedup precedent.
