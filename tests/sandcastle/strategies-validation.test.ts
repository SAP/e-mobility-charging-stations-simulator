/**
 * @file Tests for the strategy-registry ensemble-field validation.
 * @description Verifies that `validateLoopStrategyEnsemble` throws field-named
 * errors on each invalid critic-ensemble configuration, and accepts valid
 * configurations including the legacy single-critic form.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateLoopStrategyEnsemble } from '../../.sandcastle/strategies/index.js'
import { type LoopStrategy } from '../../.sandcastle/types.js'

const baseStrategy = (overrides: Partial<LoopStrategy> = {}): LoopStrategy => ({
  actorPromptFile: './a.md',
  buildActorArgs: () => ({}),
  buildCriticArgs: () => ({}),
  criticPromptFile: './c.md',
  ...overrides,
})

await describe('validateLoopStrategyEnsemble', async () => {
  await it('accepts a strategy with no ensemble fields (backward compat)', () => {
    assert.doesNotThrow(() => {
      validateLoopStrategyEnsemble('test', baseStrategy())
    })
  })

  await it('accepts a strategy with criticModel/criticEffort only (legacy)', () => {
    assert.doesNotThrow(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ criticEffort: 'low', criticModel: 'gpt-x' })
      )
    })
  })

  await it('accepts criticCount=3 with criticModels=["a","b"] (round-robin)', () => {
    assert.doesNotThrow(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ criticCount: 3, criticModels: ['a', 'b'] })
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

  await it('rejects empty criticModels', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble('test', baseStrategy({ criticModels: [] }))
    }, /criticModels.+non-empty array/)
  })

  await it('rejects criticModels with empty-string entry', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble('test', baseStrategy({ criticModels: ['a', ''] }))
    }, /criticModels.+non-empty strings/)
  })

  await it('rejects criticEfforts array length mismatch', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ criticEfforts: ['low', 'high', 'medium'], criticModels: ['a', 'b'] })
      )
    }, /criticEfforts.+array length.+must equal/)
  })

  await it('accepts criticEfforts as scalar (broadcast)', () => {
    assert.doesNotThrow(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({ criticEfforts: 'high', criticModels: ['a', 'b'] })
      )
    })
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
          criticModels: ['a', 'b'],
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
          criticModels: ['a', 'b'],
        })
      )
    })
  })

  await it('rejects criticArbiterModel without criticArbiterPromptFile', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble('test', baseStrategy({ criticArbiterModel: 'gpt-x' }))
    }, /arbiter configuration.+set together/)
  })

  await it('rejects criticArbiterPromptFile without criticArbiterModel', () => {
    assert.throws(() => {
      validateLoopStrategyEnsemble('test', baseStrategy({ criticArbiterPromptFile: './arb.md' }))
    }, /arbiter configuration.+set together/)
  })

  await it('accepts both arbiter fields set together', () => {
    assert.doesNotThrow(() => {
      validateLoopStrategyEnsemble(
        'test',
        baseStrategy({
          criticArbiterModel: 'gpt-x',
          criticArbiterPromptFile: './arb.md',
        })
      )
    })
  })
})
