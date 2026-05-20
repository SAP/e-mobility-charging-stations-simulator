/**
 * @file Tests for the strategy-registry ensemble-field validation.
 * @description Verifies that `validateLoopStrategyEnsemble` throws field-named
 * errors on each invalid agent or ensemble configuration, and accepts valid
 * configurations including the no-overrides default form.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateLoopStrategyEnsemble } from '../strategies/index.js'
import { type AgentSpec, type LoopStrategy } from '../types.js'

const baseStrategy = (overrides: Partial<LoopStrategy> = {}): LoopStrategy => ({
  actorPromptFile: './a.md',
  buildActorArgs: () => ({}),
  buildCriticArgs: () => ({}),
  criticPromptFile: './c.md',
  ...overrides,
})

const spec = (model: string, effort: AgentSpec['effort']): AgentSpec => ({ effort, model })

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
    }, /actor\.model.+non-empty/)
  })

  await it('rejects actor.effort outside the canonical enum', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ actor: { effort: 'extreme' as AgentSpec['effort'], model: 'gpt-x' } })
      )
    }, /actor\.effort.+'low'.+'medium'.+'high'/)
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
    }, /criticCount.+integer in \[1, 8\]/)
  })

  await it('rejects criticCount=9 (above MAX_CRITIC_COUNT)', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 9 }))
    }, /criticCount.+integer in \[1, 8\]/)
  })

  await it('rejects non-integer criticCount', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble('test', baseStrategy({ criticCount: 2.5 }))
    }, /criticCount/)
  })

  await it('rejects criticPool entry with blank model', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({
          criticPool: [spec('a', 'low'), { effort: 'low', model: '' }] as unknown as readonly [
            AgentSpec,
            ...AgentSpec[]
          ],
        })
      )
    }, /criticPool\[1\]\.model.+non-empty/)
  })

  await it('rejects criticPool entry with invalid effort', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({
          criticPool: [
            { effort: 'extreme' as AgentSpec['effort'], model: 'a' },
          ] as unknown as readonly [AgentSpec, ...AgentSpec[]],
        })
      )
    }, /criticPool\[0\]\.effort/)
  })

  await it('rejects criticAgreementThreshold > criticCount', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ criticAgreementThreshold: 5, criticCount: 3 })
      )
    }, /criticAgreementThreshold/)
  })

  await it('rejects criticAgreementThreshold = 0', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ criticAgreementThreshold: 0, criticCount: 3 })
      )
    }, /criticAgreementThreshold/)
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
    }, /criticEnsembleSeed.+required/)
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
    }, /arbiter\.promptFile.+non-empty/)
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
    }, /arbiter\.agent\.effort/)
  })

  await it('rejects arbiter with blank agent.model', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({
          arbiter: { agent: spec('  ', 'high'), promptFile: './arb.md' },
        })
      )
    }, /arbiter\.agent\.model.+non-empty/)
  })
})
