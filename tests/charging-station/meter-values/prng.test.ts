/**
 * @file Tests for coherent MeterValues PRNG.
 * @description Verifies deterministic seeded PRNG behavior and stream
 *   splitting independence for the physics-based coherent generator.
 *
 * Covers:
 * - mulberry32 — determinism (same seed twice → identical sequence)
 * - deriveSeed — label-based split streams stay independent
 * - hashLabel — stable across runs
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  deriveSeed,
  hashLabel,
  mulberry32,
} from '../../../src/charging-station/meter-values/prng.js'

await describe('coherent PRNG', async () => {
  await describe('mulberry32', async () => {
    await it('should produce identical sequences for identical seeds', () => {
      const a = mulberry32(42)
      const b = mulberry32(42)
      for (let i = 0; i < 100; i++) {
        assert.strictEqual(a(), b())
      }
    })

    await it('should produce different sequences for different seeds', () => {
      const a = mulberry32(1)
      const b = mulberry32(2)
      let differences = 0
      for (let i = 0; i < 100; i++) {
        if (a() !== b()) {
          differences++
        }
      }
      assert.ok(differences > 95, `expected >95 differing samples, got ${differences.toString()}`)
    })

    await it('should produce floats in [0, 1)', () => {
      const prng = mulberry32(1337)
      for (let i = 0; i < 10000; i++) {
        const v = prng()
        assert.ok(v >= 0 && v < 1, `value ${v.toString()} outside [0, 1)`)
      }
    })
  })

  await describe('hashLabel', async () => {
    await it('should hash identical labels to identical values', () => {
      assert.strictEqual(hashLabel('VOLTAGE_NOISE'), hashLabel('VOLTAGE_NOISE'))
    })

    await it('should hash distinct labels to distinct values', () => {
      assert.notStrictEqual(hashLabel('VOLTAGE_NOISE'), hashLabel('POWER_NOISE'))
      assert.notStrictEqual(hashLabel('PROFILE_PICK'), hashLabel('INITIAL_SOC'))
    })

    await it('should be stable across calls (documented as such)', () => {
      // Regression guard: if the FNV-1a constants ever change, this test
      // catches the resulting sequence shift.
      assert.strictEqual(hashLabel('SEED'), 0x8e37556c)
      assert.strictEqual(hashLabel('A'), 0xc40bf6cc)
    })
  })

  await describe('deriveSeed', async () => {
    await it('should produce independent streams per label', () => {
      const root = 42
      const seedA = deriveSeed(root, 'A')
      const seedB = deriveSeed(root, 'B')
      assert.notStrictEqual(seedA, seedB)

      const streamA = mulberry32(seedA)
      const streamB = mulberry32(seedB)
      // Two streams from different labels should not lock-step.
      let same = 0
      for (let i = 0; i < 100; i++) {
        if (streamA() === streamB()) {
          same++
        }
      }
      assert.ok(same < 5, `expected mostly different samples, ${same.toString()} matched`)
    })

    await it('should be non-shifting: adding a new label leaves existing streams intact', () => {
      const root = 1234
      const seed1 = deriveSeed(root, 'STREAM_A')
      const seed2 = deriveSeed(root, 'STREAM_B')
      // Introduce a fictitious new consumer.
      const seedNew = deriveSeed(root, 'STREAM_NEW')
      // Existing seeds must be unchanged.
      assert.strictEqual(seed1, deriveSeed(root, 'STREAM_A'))
      assert.strictEqual(seed2, deriveSeed(root, 'STREAM_B'))
      // The new stream must be distinct from the existing ones.
      assert.notStrictEqual(seedNew, seed1)
      assert.notStrictEqual(seedNew, seed2)
    })
  })
})
