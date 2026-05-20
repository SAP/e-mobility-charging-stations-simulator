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
    await it('accepts a strategy with no overrides (uses defaults)', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble('test', baseStrategy())
      })
    })

    await it('accepts an actor-only override', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ actor: spec('gpt-x', 'low') }))
      })
    })

    await it('rejects actor.model = blank string', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ actor: spec('  ', 'low') }))
      }, expectFieldError('test.actor.model'))
    })

    await it('rejects actor.effort outside the canonical enum', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ actor: { effort: 'extreme' as AgentSpec['effort'], model: 'gpt-x' } })
        )
      }, expectFieldError('test.actor.effort'))
    })

    await it('accepts criticCount=3 with criticPool length 2 (round-robin)', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ criticCount: 3, criticPool: [spec('a', 'low'), spec('b', 'high')] })
        )
      })
    })

    await it('rejects criticCount=0', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 0 }))
      }, expectFieldError('test.criticCount'))
    })

    await it('rejects criticCount=9 (above MAX_CRITIC_COUNT)', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 9 }))
      }, expectFieldError('test.criticCount'))
    })

    await it('rejects non-integer criticCount', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 2.5 }))
      }, expectFieldError('test.criticCount'))
    })

    await it('rejects criticPool entry with blank model', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticPool: asInvalidPool([spec('a', 'low'), { effort: 'low', model: '' }]),
          })
        )
      }, expectFieldError('test.criticPool[1].model'))
    })

    await it('rejects criticPool entry with invalid effort', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            criticPool: asInvalidPool([{ effort: 'extreme' as AgentSpec['effort'], model: 'a' }]),
          })
        )
      }, expectFieldError('test.criticPool[0].effort'))
    })

    await it('rejects empty criticPool', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble('test', baseStrategy({ criticPool: asInvalidPool([]) }))
      }, expectFieldError('test.criticPool'))
    })

    await it('rejects criticAgreementThreshold > criticCount', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ criticAgreementThreshold: 5, criticCount: 3 })
        )
      }, expectFieldError('test.criticAgreementThreshold'))
    })

    await it('rejects criticAgreementThreshold = 0', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({ criticAgreementThreshold: 0, criticCount: 3 })
        )
      }, expectFieldError('test.criticAgreementThreshold'))
    })

    await it('rejects random-with-replacement without seed', () => {
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

    await it('accepts random-with-replacement with seed', () => {
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

    await it('accepts an arbiter struct with both fields set', () => {
      assert.doesNotThrow(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { agent: spec('gpt-x', 'high'), promptFile: './arb.md' },
          })
        )
      })
    })

    await it('rejects arbiter with blank promptFile', () => {
      assert.throws(() => {
        validateLoopStrategyEnsemble(
          'test',
          baseStrategy({
            arbiter: { agent: spec('gpt-x', 'high'), promptFile: '' },
          })
        )
      }, expectFieldError('test.arbiter.promptFile'))
    })

    await it('rejects arbiter with invalid agent.effort', () => {
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

    await it('rejects arbiter with blank agent.model', () => {
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
    await it('accepts a single well-formed entry', () => {
      assert.doesNotThrow(() => {
        validateRegistryEntries([validEntry('implement')])
      })
    })

    await it('rejects key not matching kebab-case pattern (uppercase)', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('Implement')])
      }, expectFieldError('STRATEGY_REGISTRY[0].key'))
    })

    await it('rejects key starting with a digit', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('1implement')])
      }, expectFieldError('STRATEGY_REGISTRY[0].key'))
    })

    await it('rejects controlTag with angle brackets', () => {
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

    await it('rejects duplicate keys', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('implement'), validEntry('implement')])
      }, expectFieldError('STRATEGY_REGISTRY[1].key'))
    })

    await it('rejects key that prefix-overlaps an existing key', () => {
      assert.throws(() => {
        validateRegistryEntries([validEntry('a'), validEntry('a-b')])
      }, expectFieldError('STRATEGY_REGISTRY[1].key'))
    })

    await it('propagates ensemble-field errors with their dotted field path', () => {
      const badStrategy = baseStrategy({ criticCount: 0 })
      assert.throws(() => {
        validateRegistryEntries([
          { key: 'implement', strategy: badStrategy as StrategyEntry['strategy'] },
        ])
      }, expectFieldError("strategy 'implement'.criticCount"))
    })
  })
})
