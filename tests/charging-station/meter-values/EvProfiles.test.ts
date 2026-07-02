/**
 * @file Tests for EV profile loader and helpers.
 * @description Verifies profile validation, selection, and curve
 *   interpolation used by the coherent MeterValues generator.
 *
 * Covers:
 * - interpolateChargingCurve — boundaries and mid-points
 * - selectEvProfile — weight-based selection determinism
 * - loadEvProfilesFile — fail-soft on missing/invalid files, sort by SoC
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { EvProfile } from '../../../src/charging-station/meter-values/types.js'

import {
  interpolateChargingCurve,
  loadEvProfilesFile,
  selectEvProfile,
} from '../../../src/charging-station/meter-values/EvProfiles.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

const midProfile: EvProfile = {
  batteryCapacityWh: 40000,
  chargingCurve: [
    { powerFraction: 1, socPercent: 0 },
    { powerFraction: 0.5, socPercent: 50 },
    { powerFraction: 0.1, socPercent: 100 },
  ],
  id: 'mid',
  initialSocPercentMax: 60,
  initialSocPercentMin: 10,
  maxPowerW: 11000,
  weight: 1,
}

await describe('EvProfiles', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await describe('interpolateChargingCurve', async () => {
    await it('should return endpoint value at the lower boundary', () => {
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, 0), 1)
    })

    await it('should return endpoint value at the upper boundary', () => {
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, 100), 0.1)
    })

    await it('should clamp below the first point', () => {
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, -10), 1)
    })

    await it('should clamp above the last point', () => {
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, 200), 0.1)
    })

    await it('should interpolate the midpoint linearly', () => {
      // At SoC=50 the curve value is 0.5 exactly.
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, 50), 0.5)
      // At SoC=25: halfway between (0,1) and (50,0.5) → 0.75.
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, 25), 0.75)
      // At SoC=75: halfway between (50,0.5) and (100,0.1) → 0.30.
      assert.strictEqual(interpolateChargingCurve(midProfile.chargingCurve, 75), 0.3)
    })

    await it('should return 1 for empty curves', () => {
      assert.strictEqual(interpolateChargingCurve([], 50), 1)
    })
  })

  await describe('selectEvProfile', async () => {
    const profiles: EvProfile[] = [
      { ...midProfile, id: 'A', weight: 1 },
      { ...midProfile, id: 'B', weight: 3 },
    ]

    await it('should always select first profile with random=0', () => {
      const chosen = selectEvProfile(profiles, 0)
      assert.strictEqual(chosen.id, 'A')
    })

    await it('should select second profile when random exceeds first weight fraction', () => {
      // totalWeight=4. At random=0.5 → target=2 → A(1) < 2, B(4) >= 2 ⇒ B.
      assert.strictEqual(selectEvProfile(profiles, 0.5).id, 'B')
    })

    await it('should fall back to first profile when total weight is zero', () => {
      const zero: EvProfile[] = [
        { ...midProfile, id: 'A', weight: 0 },
        { ...midProfile, id: 'B', weight: 0 },
      ]
      assert.strictEqual(selectEvProfile(zero, 0.999).id, 'A')
    })
  })

  await describe('loadEvProfilesFile', async () => {
    await it('should return undefined on missing file (fail-soft)', () => {
      const result = loadEvProfilesFile('/nonexistent/path/ev-profiles.json', 'test')
      assert.strictEqual(result, undefined)
    })

    await it('should return undefined on invalid JSON (fail-soft)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'ev-profiles-'))
      const path = join(dir, 'bad.json')
      writeFileSync(path, '{not json}')
      try {
        const result = loadEvProfilesFile(path, 'test')
        assert.strictEqual(result, undefined)
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })

    await it('should return undefined on schema violation', () => {
      const dir = mkdtempSync(join(tmpdir(), 'ev-profiles-'))
      const path = join(dir, 'bad-schema.json')
      writeFileSync(
        path,
        JSON.stringify({
          profiles: [
            {
              // missing batteryCapacityWh and others
              chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
              id: 'x',
            },
          ],
        })
      )
      try {
        const result = loadEvProfilesFile(path, 'test')
        assert.strictEqual(result, undefined)
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })

    await it('should load a valid file and sort curve by socPercent', () => {
      const dir = mkdtempSync(join(tmpdir(), 'ev-profiles-'))
      const path = join(dir, 'ok.json')
      writeFileSync(
        path,
        JSON.stringify({
          profiles: [
            {
              batteryCapacityWh: 40000,
              // Intentionally unordered — loader must sort in place.
              chargingCurve: [
                { powerFraction: 0.1, socPercent: 100 },
                { powerFraction: 1, socPercent: 0 },
                { powerFraction: 0.5, socPercent: 50 },
              ],
              id: 'test',
              initialSocPercentMax: 60,
              initialSocPercentMin: 10,
              maxPowerW: 11000,
              weight: 1,
            },
          ],
        })
      )
      try {
        const result = loadEvProfilesFile(path, 'test')
        assert.ok(result != null)
        const curve = result.profiles[0].chargingCurve
        assert.strictEqual(curve[0].socPercent, 0)
        assert.strictEqual(curve[1].socPercent, 50)
        assert.strictEqual(curve[2].socPercent, 100)
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })

    await it('should swap inverted initial SoC bounds', () => {
      const dir = mkdtempSync(join(tmpdir(), 'ev-profiles-'))
      const path = join(dir, 'inverted.json')
      writeFileSync(
        path,
        JSON.stringify({
          profiles: [
            {
              batteryCapacityWh: 40000,
              chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
              id: 'test',
              initialSocPercentMax: 20,
              initialSocPercentMin: 80,
              maxPowerW: 11000,
              weight: 1,
            },
          ],
        })
      )
      try {
        const result = loadEvProfilesFile(path, 'test')
        assert.ok(result != null)
        assert.strictEqual(result.profiles[0].initialSocPercentMin, 20)
        assert.strictEqual(result.profiles[0].initialSocPercentMax, 80)
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })
  })
})
