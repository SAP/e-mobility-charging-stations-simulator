/**
 * @file Tests for `.sandcastle/strategies/index.ts` exports.
 * @description Covers `validateLoopStrategyEnsemble` (per-strategy actor /
 * critic / arbiter / ensemble field rules) and `validateRegistryEntries`
 * (registry-load fail-fast: key pattern, controlTag pattern, duplicates,
 * prefix-overlap). Assertions go through `StrategyValidationError.field`
 * (typed-error contract per AGENTS.md) rather than message regex.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  type StrategyEntry,
  StrategyValidationError,
  validateLoopStrategyEnsemble,
  validateRegistryEntries,
} from '../strategies/index.js'
import { type AgentSpec, type LoopStrategy } from '../types.js'
import { asInvalidPool, baseStrategy, spec } from './factories.js'

const expectFieldError =
  (field: string) =>
    (err: unknown): err is StrategyValidationError =>
      err instanceof StrategyValidationError && err.field === field

const validStrategy: LoopStrategy = baseStrategy()

const validEntry = (key: string): StrategyEntry => ({
  key,
  strategy: validStrategy as StrategyEntry['strategy'],
})

await describe('strategies', async () => {
  await describe('validateLoopStrategyEnsemble', async () => {
    await it('should accept a strategy with no overrides (uses defaults)', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble('test', baseStrategy())
      })
    })

    await it('should accept an actor-only override', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ actor: spec('gpt-x', 'low') }))
      })
    })

    await it('should reject actor.model = blank string', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ actor: spec('  ', 'low') }))
      }, expectFieldError('test.actor.model'))
    })

    await it('should reject actor.effort outside the canonical enum', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ actor: { effort: 'extreme' as AgentSpec['effort'], model: 'gpt-x' } })
        )
      }, expectFieldError('test.actor.effort'))
    })

    await it('should accept criticCount=3 with criticPool length 2 (round-robin)', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ criticCount: 3, criticPool: [spec('a', 'low'), spec('b', 'high')] })
        )
      })
    })

    await it('should reject criticCount=0', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 0 }))
      }, expectFieldError('test.criticCount'))
    })

    await it('should reject criticCount=9 (above MAX_CRITIC_COUNT)', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 9 }))
      }, expectFieldError('test.criticCount'))
    })

    await it('should reject non-integer criticCount', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 2.5 }))
      }, expectFieldError('test.criticCount'))
    })

    await it('should reject criticPool entry with blank model', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticPool: asInvalidPool([spec('a', 'low'), { effort: 'low', model: '' }]),
          })
        )
      }, expectFieldError('test.criticPool[1].model'))
    })

    await it('should reject criticPool entry with invalid effort', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticPool: asInvalidPool([{ effort: 'extreme' as AgentSpec['effort'], model: 'a' }]),
          })
        )
      }, expectFieldError('test.criticPool[0].effort'))
    })

    await it('should reject empty criticPool', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticPool: asInvalidPool([]) }))
      }, expectFieldError('test.criticPool'))
    })

    await it('should reject criticPool length > MAX_CRITIC_COUNT', () => {
      const oversized = Array.from({ length: 9 }, (_, i) => spec(`m${String(i)}`, 'low'))
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticPool: asInvalidPool(oversized) }))
      }, expectFieldError('test.criticPool'))
    })

    await it('should reject criticCount < criticPool.length (silent truncation guard)', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticCount: 1,
            criticPool: [spec('a', 'low'), spec('b', 'high'), spec('c', 'medium')],
          })
        )
      }, expectFieldError('test.criticCount'))
    })

    await it('should reject criticAgreementThreshold > criticCount', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ criticAgreementThreshold: 5, criticCount: 3 })
        )
      }, expectFieldError('test.criticAgreementThreshold'))
    })

    await it('should reject criticAgreementThreshold = 0', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ criticAgreementThreshold: 0, criticCount: 3 })
        )
      }, expectFieldError('test.criticAgreementThreshold'))
    })

    await it('should accept threshold up to resolved slot count when criticCount is unset (validator aligned with resolveCriticSlots)', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticAgreementThreshold: 2,
            criticPool: [spec('a', 'low'), spec('b', 'high')],
          })
        )
      })
    })

    await it('should reject random-with-replacement without seed', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticCount: 5,
            criticFillStrategy: 'random-with-replacement',
            criticPool: [spec('a', 'low'), spec('b', 'high')],
          })
        )
      }, expectFieldError('test.criticEnsembleSeed'))
    })

    await it('should accept random-with-replacement with seed', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticCount: 5,
            criticEnsembleSeed: 42,
            criticFillStrategy: 'random-with-replacement',
            criticPool: [spec('a', 'low'), spec('b', 'high')],
          })
        )
      })
    })

    await it('should accept an arbiter struct with both fields set', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { agent: spec('gpt-x', 'high'), promptFile: './arb.md' },
          })
        )
      })
    })

    await it('should accept an arbiter struct with only promptFile (agent inherits AGENT_ARBITER_DEFAULT)', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { promptFile: './arb.md' },
          })
        )
      })
    })

    await it('should reject arbiter with blank promptFile', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { agent: spec('gpt-x', 'high'), promptFile: '' },
          })
        )
      }, expectFieldError('test.arbiter.promptFile'))
    })

    await it('should reject arbiter with whitespace-only promptFile', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { agent: spec('gpt-x', 'high'), promptFile: '   ' },
          })
        )
      }, expectFieldError('test.arbiter.promptFile'))
    })

    await it('should reject arbiter with invalid agent.effort', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: {
              agent: { effort: 'extreme' as AgentSpec['effort'], model: 'gpt-x' },
              promptFile: './arb.md',
            },
          })
        )
      }, expectFieldError('test.arbiter.agent.effort'))
    })

    await it('should reject arbiter with blank agent.model', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { agent: spec('  ', 'high'), promptFile: './arb.md' },
          })
        )
      }, expectFieldError('test.arbiter.agent.model'))
    })
  })

  await describe('validateRegistryEntries', async () => {
    await it('should accept a single well-formed entry', () => {
      assert.doesNotThrow(() => {
        validateRegistryEntries([validEntry('implement')])
      })
    })

    await it('should reject key not matching kebab-case pattern (uppercase)', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('Implement')])
      }, expectFieldError('STRATEGY_REGISTRY[0].key'))
    })

    await it('should reject key starting with a digit', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('1implement')])
      }, expectFieldError('STRATEGY_REGISTRY[0].key'))
    })

    await it('should reject controlTag with angle brackets', () => {
      assert.throws(() => {
        validateRegistryEntries([
          {
            controlTags: ['<bad>'],
            key: 'implement',
            strategy: validStrategy as StrategyEntry['strategy'],
          },
        ])
      }, expectFieldError('STRATEGY_REGISTRY[0].controlTags[0]'))
    })

    await it('should reject duplicate keys', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('implement'), validEntry('implement')])
      }, expectFieldError('STRATEGY_REGISTRY[1].key'))
    })

    await it('should reject key that prefix-overlaps an existing key', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('a'), validEntry('a-b')])
      }, expectFieldError('STRATEGY_REGISTRY[1].key'))
    })

    await it('should propagate ensemble-field errors with their dotted field path', () => {
      const badStrategy = baseStrategy({ criticCount: 0 })
      assert.throws(() => {
        validateRegistryEntries([
          { key: 'implement', strategy: badStrategy as StrategyEntry['strategy'] },
        ])
      }, expectFieldError("strategy 'implement'.criticCount"))
    })
  })
})
