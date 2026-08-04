/**
 * @file Tests for template AC/DC conversion efficiency (issue #443).
 * @description On DC stations, template `maximumPower` is the AC input-side
 * power; the power available for charging is `input * conversionEfficiency`.
 * The factor is applied at runtime in `getConnectorMaximumAvailablePower` only
 * (DC-only, absent => 1). `stationInfo.maximumPower` (the AC input-side power)
 * and `stationInfo.maximumAmperage` (derived from it as `maximumPower /
 * voltageOut` on DC) are left unchanged and are not reduced by the factor.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

const POWER_W = 50000

const tmpRoots: string[] = []

interface TemplateOverrides {
  connectorMaximumPower?: number
  conversionEfficiency?: number
  currentOutType?: string
}

// Fresh DC template with powerSharedByConnectors:false (deterministic
// powerDivider = number of connectors). By default the connectors carry no
// explicit maximumPower, so the per-connector default power is derived from the
// station power and the station bound is the binding one; an explicit
// connectorMaximumPower override makes the connector hardware bound binding
// instead, to exercise the second power-derived term of the min().
const makeTemplate = (overrides: TemplateOverrides = {}): string => {
  const root = mkdtempSync(join(tmpdir(), 'cs-conversion-efficiency-'))
  tmpRoots.push(root)
  mkdirSync(join(root, 'station-templates'), { recursive: true })
  const file = join(root, 'station-templates', 'dc.station-template.json')
  const connectorMaximumPower =
    overrides.connectorMaximumPower != null ? { maximumPower: overrides.connectorMaximumPower } : {}
  const template: Record<string, unknown> = {
    $schemaVersion: 1,
    baseName: 'TEST-CONVERSION-EFFICIENCY',
    chargePointModel: 'Simulator simple',
    chargePointVendor: 'Simulator',
    Connectors: {
      0: {},
      1: { bootStatus: 'Available', ...connectorMaximumPower },
      2: { bootStatus: 'Available', ...connectorMaximumPower },
    },
    currentOutType: overrides.currentOutType ?? 'DC',
    numberOfConnectors: 2,
    power: POWER_W,
    powerSharedByConnectors: false,
    powerUnit: 'W',
    randomConnectors: false,
    ...(overrides.conversionEfficiency != null
      ? { conversionEfficiency: overrides.conversionEfficiency }
      : {}),
  }
  writeFileSync(file, JSON.stringify(template), 'utf8')
  return file
}

const newStation = (overrides: TemplateOverrides = {}): ChargingStation =>
  new ChargingStation(1, makeTemplate(overrides), {
    autoStart: false,
    baseName: 'TEST-CONVERSION-EFFICIENCY',
    fixedName: true,
    persistentConfiguration: false,
    supervisionUrls: 'ws://localhost:9999/',
  })

await describe('ChargingStation AC/DC conversion efficiency', async () => {
  afterEach(() => {
    standardCleanup()
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true })
    }
  })

  await it('reduces the DC connector available power by the efficiency factor', () => {
    const baseline = newStation().getConnectorMaximumAvailablePower(1)
    const reduced = newStation({ conversionEfficiency: 0.9 }).getConnectorMaximumAvailablePower(1)
    assert.ok(Number.isFinite(baseline) && baseline > 0)
    assert.ok(Math.abs(reduced - baseline * 0.9) < 1e-6)
  })

  await it('reduces the binding DC connector hardware power bound by the factor', () => {
    // Explicit per-connector hardware bound (10000 W) below the station-derived
    // bound (power / connectors = 50000 / 2 = 25000 W) so the hardware term is
    // the one selected by min(); it must itself be reduced by the factor.
    const baseline = newStation({
      connectorMaximumPower: 10000,
    }).getConnectorMaximumAvailablePower(1)
    const reduced = newStation({
      connectorMaximumPower: 10000,
      conversionEfficiency: 0.9,
    }).getConnectorMaximumAvailablePower(1)
    assert.strictEqual(baseline, 10000)
    assert.ok(Math.abs(reduced - 10000 * 0.9) < 1e-6)
  })

  await it('leaves DC connector available power unchanged when efficiency is absent', () => {
    const withoutField = newStation().getConnectorMaximumAvailablePower(1)
    const withUnity = newStation({ conversionEfficiency: 1 }).getConnectorMaximumAvailablePower(1)
    assert.strictEqual(withoutField, withUnity)
  })

  await it('ignores the efficiency factor on AC stations', () => {
    const acBaseline = newStation({ currentOutType: 'AC' }).getConnectorMaximumAvailablePower(1)
    const acWithEfficiency = newStation({
      conversionEfficiency: 0.9,
      currentOutType: 'AC',
    }).getConnectorMaximumAvailablePower(1)
    assert.strictEqual(acWithEfficiency, acBaseline)
  })

  await it('does not reduce stationInfo.maximumPower or maximumAmperage', () => {
    const baseline = newStation()
    const reduced = newStation({ conversionEfficiency: 0.9 })
    assert.strictEqual(reduced.stationInfo?.maximumPower, baseline.stationInfo?.maximumPower)
    assert.strictEqual(reduced.stationInfo?.maximumAmperage, baseline.stationInfo?.maximumAmperage)
  })
})
