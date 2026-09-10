/**
 * @file Tests for template AC/DC conversion efficiency.
 * @description On DC stations, template `maximumPower` is the AC input-side
 * power; the power available for charging is `input * conversionEfficiency`.
 * The factor is applied at runtime in `getConnectorMaximumAvailablePower` only
 * (DC-only, absent => 1). `stationInfo.maximumPower` (the AC input-side power)
 * and `stationInfo.maximumAmperage` (derived from it as `maximumPower /
 * voltageOut` on DC) are left unchanged and are not reduced by the factor.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  createStationFromTemplate,
  resolvePersistedConfigurationFile,
  writeStationTemplate,
} from './helpers/StationHelpers.realStation.js'

const POWER_W = 50000

interface TemplateOverrides {
  connectorMaximumPower?: number
  conversionEfficiency?: number
  currentOutType?: string
  numberOfPhases?: number
}

// Fresh DC template with powerSharedByConnectors:false (deterministic
// powerDivider = number of connectors). By default the connectors carry no
// explicit maximumPower, so the per-connector default power is derived from the
// station power and the station bound is the binding one; an explicit
// connectorMaximumPower override makes the connector hardware bound binding
// instead, to exercise the second power-derived term of the min().
const buildTemplate = (overrides: TemplateOverrides = {}): Record<string, unknown> => {
  const connectorMaximumPower =
    overrides.connectorMaximumPower != null ? { maximumPower: overrides.connectorMaximumPower } : {}
  return {
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
    ...(overrides.numberOfPhases != null ? { numberOfPhases: overrides.numberOfPhases } : {}),
    power: POWER_W,
    powerSharedByConnectors: false,
    powerUnit: 'W',
    randomConnectors: false,
    ...(overrides.conversionEfficiency != null
      ? { conversionEfficiency: overrides.conversionEfficiency }
      : {}),
  }
}

const newStation = (overrides: TemplateOverrides = {}): ChargingStation =>
  createStationFromTemplate(writeStationTemplate(buildTemplate(overrides)), {
    baseName: 'TEST-CONVERSION-EFFICIENCY',
    fixedName: true,
    persistentConfiguration: false,
  })

await describe('ChargingStation AC/DC conversion efficiency', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupStationTemplates()
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

  for (const rehydrationCase of [
    {
      conversionEfficiency: 1,
      currentOutType: 'AC',
      expectedCurrentOutType: 'AC',
      expectedEnergyWh: 2000,
      numberOfPhases: 1,
      persistentConfiguration: true,
    },
    {
      conversionEfficiency: 0.8,
      currentOutType: 'DC',
      expectedCurrentOutType: 'DC',
      expectedEnergyWh: 1600,
      numberOfPhases: 0,
      persistentConfiguration: true,
    },
    {
      conversionEfficiency: 0.8,
      currentOutType: 'DC',
      expectedCurrentOutType: 'AC',
      expectedEnergyWh: 6000,
      numberOfPhases: 0,
      persistentConfiguration: false,
    },
  ]) {
    await it(`rehydrates legacy interval energy with ${rehydrationCase.persistentConfiguration ? 'persisted' : 'template'} electrical properties`, async () => {
      const templateFile = writeStationTemplate(
        buildTemplate({ currentOutType: 'AC', numberOfPhases: 3 })
      )
      createStationFromTemplate(templateFile, {
        baseName: 'TEST-CONVERSION-EFFICIENCY',
        fixedName: true,
        persistentConfiguration: true,
      })
      await flushMicrotasks()
      const configurationFile = resolvePersistedConfigurationFile(templateFile)
      const configuration = JSON.parse(readFileSync(configurationFile, 'utf8')) as {
        connectorsStatus: [number, Record<string, unknown>][]
        stationInfo: Record<string, unknown>
      }
      configuration.stationInfo.currentOutType = rehydrationCase.currentOutType
      configuration.stationInfo.numberOfPhases = rehydrationCase.numberOfPhases
      configuration.stationInfo.conversionEfficiency = rehydrationCase.conversionEfficiency
      const connectorStatus = configuration.connectorsStatus.find(
        ([connectorId]) => connectorId === 1
      )?.[1]
      assert.ok(connectorStatus != null)
      const transactionId = '00000000-0000-4000-8000-000000000030'
      const timestamp = '2026-09-01T12:00:00.000Z'
      connectorStatus.transactionId = transactionId
      connectorStatus.transactionEventQueue = [
        {
          request: {
            eventType: 'Updated',
            meterValue: [
              {
                sampledValue: [
                  {
                    context: 'Sample.Clock',
                    location: 'Inlet',
                    measurand: 'Energy.Active.Import.Interval',
                    phase: 'L1-N',
                    unitOfMeasure: { unit: 'kWh' },
                    value: 2,
                  },
                ],
                timestamp,
              },
            ],
            seqNo: 1,
            timestamp,
            transactionInfo: { transactionId },
            triggerReason: 'MeterValueClock',
          },
          seqNo: 1,
          timestamp,
        },
      ]
      writeFileSync(configurationFile, JSON.stringify(configuration), 'utf8')

      const reloaded = createStationFromTemplate(templateFile, {
        baseName: 'TEST-CONVERSION-EFFICIENCY',
        fixedName: true,
        persistentConfiguration: rehydrationCase.persistentConfiguration,
      })

      const reloadedStationInfo = reloaded.stationInfo
      assert.ok(reloadedStationInfo != null)
      assert.strictEqual(reloadedStationInfo.currentOutType, rehydrationCase.expectedCurrentOutType)
      assert.ok(
        Number.isFinite(reloadedStationInfo.maximumAmperage) &&
          (reloadedStationInfo.maximumAmperage ?? 0) > 0
      )
      assert.strictEqual(
        reloaded.getConnectorStatus(1)?.transactionEventQueue?.[0]
          .transactionEnergyActiveImportIntervalConsumption?.['AlignedDataCtrlr.Measurands'],
        rehydrationCase.expectedEnergyWh
      )
    })
  }

  await it('does not reduce stationInfo.maximumPower or maximumAmperage', () => {
    const baseline = newStation()
    const reduced = newStation({ conversionEfficiency: 0.9 })
    assert.strictEqual(reduced.stationInfo?.maximumPower, baseline.stationInfo?.maximumPower)
    assert.strictEqual(reduced.stationInfo?.maximumAmperage, baseline.stationInfo?.maximumAmperage)
  })
})
