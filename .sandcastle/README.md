# `.sandcastle/` — Actor↔critic refinement loop orchestrator

Internal orchestration layer that drives an actor↔critic loop on top of `@ai-hero/sandcastle` sandboxes. Discovers GitHub-issue tasks, runs an actor agent to implement each, runs N critic agents to review, merges findings by majority vote with deduplication, iterates until convergence, and finalizes via PR creation.

## Module map

| File                    | Purpose                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main.ts`               | Entrypoint. Discovers tasks via `task-source.ts`, fans out to `runRefinementLoop` under a `concurrency-pool.ts` cap, finalizes via the strategy. |
| `refinement-loop.ts`    | The implement↔critic loop. Per-round: actor → N critics in parallel → merge → convergence/ratchet check.                                         |
| `merge-findings.ts`     | Pure module: slot resolution, cross-critic dedup key, voted merge with median tie-up severity aggregation, disagreement scoring.                 |
| `strategies/index.ts`   | Registry of strategies (`implement` etc.) with fail-fast validation at module load.                                                              |
| `strategies/implement/` | The default strategy: actor prompt, critic prompt, finalization (rebase + push + `gh pr create`).                                                |
| `task-source.ts`        | GitHub issue discovery, planner, branch policy, sanitization.                                                                                    |
| `finalizer.ts`          | Rebase/push helpers + PR-arg construction.                                                                                                       |
| `validation.ts`         | Mid-loop and post-loop work-quality validation runner (default `pnpm -r format && typecheck && lint && build && test`).                          |
| `concurrency-pool.ts`   | O(1) FIFO concurrency limiter for parallel task processing.                                                                                      |
| `types.ts`              | Shared types: `LoopStrategy`, `Finding`, `RoundSnapshot`, `CriticSlot`, `TaskSpec`, etc.                                                         |
| `constants.ts`          | Canonical defaults (models, efforts, timeouts, MAX_CRITIC_COUNT, etc.).                                                                          |

## Multi-critic ensemble

A round can run **N critics in parallel** instead of a single critic, with majority voting and ordinal severity aggregation. Backward compatible: when no agent or ensemble fields are set on the strategy, the loop runs a single-critic round byte-equivalent to the pre-ensemble behavior, using `AGENT_CRITIC_POOL_DEFAULT[0]`.

### `AgentSpec` — the canonical (model, effort) pair

Every agent role — **actor, critic-pool entry, arbiter, planner** — is described by an `AgentSpec`:

```ts
interface AgentSpec {
  readonly effort: 'low' | 'medium' | 'high' // bound to this specific model
  readonly model: string // provider-qualified id
}
```

`effort` is **required**: the right effort is a property of the model, so silent role-wide effort fallbacks would defeat the purpose of the pairing. Strategies that want a different effort for a different model declare a distinct `AgentSpec`. To override the model while keeping the canonical effort: `{ ...AGENT_ACTOR_DEFAULT, model: 'x' }`.

Canonical defaults are exported from [`constants.ts`](./constants.ts):

| Constant                    | Role                                         | Used by                                                       |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `AGENT_ACTOR_DEFAULT`       | Actor (implementer)                          | `runRefinementLoop` when `LoopStrategy.actor` is unset.       |
| `AGENT_CRITIC_POOL_DEFAULT` | Critic pool (non-empty `AgentSpec` tuple)    | `resolveCriticSlots` when `LoopStrategy.criticPool` is unset. |
| `AGENT_ARBITER_DEFAULT`     | Stage-2 arbiter (synthesis over merged list) | Strategy-supplied; spread into `arbiter.agent` to opt in.     |
| `AGENT_PLANNER_DEFAULT`     | Planner (issue triage / acceptance criteria) | `task-source.ts` GitHub issue planning step.                  |

### Strategy fields (all optional)

| Field                      | Type                                         | Default                     | Purpose                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor`                    | `AgentSpec`                                  | `AGENT_ACTOR_DEFAULT`       | Actor agent.                                                                                                                                                                                                         |
| `criticPool`               | `readonly [AgentSpec, ...AgentSpec[]]`       | `AGENT_CRITIC_POOL_DEFAULT` | Non-empty pool of critic agents drawn from each round (compile-time tuple).                                                                                                                                          |
| `criticCount`              | `number`                                     | `1`                         | Number of critic slots per round. Hard-capped at `MAX_CRITIC_COUNT = 8`.                                                                                                                                             |
| `criticAgreementThreshold` | `number \| ((validCount: number) => number)` | `Math.ceil(validCount / 2)` | Min vote count to keep a finding (simple majority by default).                                                                                                                                                       |
| `criticFillStrategy`       | `'round-robin' \| 'random-with-replacement'` | `'round-robin'`             | How to fill slots when `criticCount > criticPool.length`.                                                                                                                                                            |
| `criticEnsembleSeed`       | `number`                                     | n/a                         | Required when `criticFillStrategy === 'random-with-replacement'`; deterministic seeded fill.                                                                                                                         |
| `arbiter`                  | `{ agent: AgentSpec; promptFile: string }`   | n/a                         | Optional stage-2 arbiter LLM (MoA pattern); applied to HIGH/CRITICAL findings only when set. Both fields required together (encoded by type). Spread `AGENT_ARBITER_DEFAULT` into `agent` for the canonical default. |

### Slot resolution

The active pool is `strategy.criticPool ?? AGENT_CRITIC_POOL_DEFAULT` (compile-time non-empty by virtue of the tuple type). Slot count is `strategy.criticCount ?? max(AGENT_CRITIC_COUNT, pool.length)`. When `count <= pool.length` → take first `count` specs in declared order. When `count > pool.length`:

- `round-robin` (default): cyclic `pool[i % L]`. Deterministic, no RNG.
- `random-with-replacement`: seeded uniform sampling via `crypto`-derived index from `criticEnsembleSeed`. Reproducible across runs with the same seed.

Each resolved slot carries the `AgentSpec`'s `model` and `effort` atomically — reordering `criticPool` cannot misalign efforts because there is nothing to misalign with (the legacy `criticModels`/`criticEfforts` parallel-array failure mode is structurally eliminated).

### Parallel execution

Slots run via `Promise.allSettled` over independent `sandbox.run(...)` calls. Each slot has its own `idleTimeoutSeconds` (`AGENT_IDLE_TIMEOUT_S`), per-slot single parse-retry (mirrors legacy semantics), and a unique nonce `${roundNonce}-c${slotIndex}`.

### Quorum

If fewer than `⌈N/2⌉` slots return parseable findings, the round is marked `critic_errored` and findings are not merged this round. The simple-majority threshold is calibrated for crash-fault tolerance (LLM critics fail in non-adversarial ways: timeouts, parse failures, OOM); BFT thresholds (`⌈2N/3⌉`) are not warranted (Castro & Liskov, OSDI 1999).

### Merge algorithm (pure, deterministic)

For each finding across valid critics, compute the dedup key:

```
key = `${file}::${normalizeCategory(category)}::${ctxHashOfLinesAround(line, radius=3)}`
```

`normalizeCategory` lowercases and strips non-alphanumerics so `"sql-injection"`, `"SQL Injection"`, and `"SQLInjection"` collapse to the same bucket. Severity is intentionally absent from the key so the same defect flagged at different severities aggregates into one merged finding.

For each key with `votes >= threshold`:

- **Severity**: median of voters' severities, ties broken **UP** the ladder `LOW < MEDIUM < HIGH < CRITICAL`.
- **Confidence**: median, ties broken UP `LOW < MEDIUM < HIGH`.
- **Title / description / suggestion / line**: copied from the voter with the **lowest critic-slot index** (deterministic; bias-free per Zheng et al. 2023, arXiv:2306.05685, which documents that "longest description wins" amplifies verbosity bias systematically across all LLM judges).
- **`votes` / `voters`**: as computed.
- **`disagreementScore`**: variance of voters' severity ranks normalized by `9/4` (theoretical maximum for the 4-level ordinal ladder), in `[0, 1]`. Calibration-free uncertainty signal — preferred over textual confidence labels which Kadavath et al. 2022 (arXiv:2207.05221) show are unreliable on novel tasks.

### Singleton CRITICAL escape (D4)

A finding flagged by exactly one critic with `severity=CRITICAL` AND `confidence=HIGH` survives the threshold drop, but its merged severity is **capped at HIGH** and `contested = true`. Rationale: missing a real CRITICAL costs more than a false positive (asymmetric medical-triage analogy), but a single critic should not have unilateral CRITICAL veto power.

### Convergence and quality ratchet

The merge result is fed into the existing convergence rule: `mergedNonLow.length === 0 AND !criticalPersistent`. The quality ratchet compares `merged.filter(s => s.severity !== 'LOW').length` round-over-round (NOT sum-of-votes, which would fluctuate with `validCriticCount`).

## Industry-norm divergence (D2)

Industry SAST aggregation conventionally uses **MAX** severity (CVSS v3.1 §3.8 mandates highest score; GitHub/GHAS shows highest severity at a location; DefectDojo preserves first-seen severity). This module deliberately uses **median tie-up** because LLM critics are stochastic and miscalibrated — median is robust to single outlier critics. The singleton-CRITICAL escape hatch (D4) covers the asymmetric-cost cases where MAX would otherwise be safer.

## Validation at registry load

Strategies are validated at module load (`strategies/index.ts`). Misconfiguration throws field-named errors before any sandbox is spawned:

- `actor.model` blank, or `actor.effort` outside `'low'|'medium'|'high'`.
- `criticCount` not an integer in `[1, MAX_CRITIC_COUNT]`.
- `criticPool` empty array; pool entry with blank model or invalid effort.
- `criticAgreementThreshold` (when number) outside `[1, criticCount]`.
- `criticFillStrategy === 'random-with-replacement'` without `criticEnsembleSeed`.
- `arbiter.agent` invalid, or `arbiter.promptFile` blank. (The "set together" rule for arbiter is encoded structurally by the type.)

## Cost model

Wall-time per round ≈ `max(t_i)` for `i` in slots (full parallel). Token cost ≈ `N × per-critic-tokens`. Self-consistency (Wang et al. 2022, arXiv:2203.11171) shows diminishing returns past N≈20–40; PoLL (Verga et al. 2024, arXiv:2404.18796) finds N=3 sweet spot. `MAX_CRITIC_COUNT=8` sits at the knee of the curve; recommended default is `criticCount=1` (legacy single-critic) and bump to N=3 only when single-critic precision is insufficient.

## References

- Wang et al. 2022 — Self-Consistency, [arXiv:2203.11171](https://arxiv.org/abs/2203.11171).
- Wang et al. 2024 — Mixture-of-Agents, [arXiv:2406.04692](https://arxiv.org/abs/2406.04692).
- Zheng et al. 2023 — LLM-as-a-Judge biases, [arXiv:2306.05685](https://arxiv.org/abs/2306.05685).
- Verga et al. 2024 — PoLL Panel of LLM Evaluators, [arXiv:2404.18796](https://arxiv.org/abs/2404.18796).
- Kadavath et al. 2022 — LLMs (mostly) know what they know, [arXiv:2207.05221](https://arxiv.org/abs/2207.05221).
- Castro & Liskov 1999 — Practical Byzantine Fault Tolerance, OSDI 1999.

## Tests

```sh
NODE_ENV=test node --import tsx --test 'tests/sandcastle/*.test.ts'
```

Covers: backward compat (N=1 identity), slot resolution (round-robin, random-seeded), severity median tie-up, dedup with category-phrasing variance, singleton-CRITICAL escape with HIGH cap, disagreement scoring, registry validation (17 cases).
