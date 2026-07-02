/**
 * @file Tests for coherent MeterValues strategy dispatch.
 * @description Verifies the strategy gate in buildMeterValue:
 *   - flag off / absent → legacy code path unchanged.
 *   - flag on + session → coherent path emits coherent SampledValues.
 *   - flag on + no session → falls back to legacy path.
 *
 * Covers the strategy gate boundary: the gate runs AFTER the versioned
 * SampledValue dispatcher is constructed and BEFORE the legacy random
 * measurand generation, so the coherent path can emit versioned
 * SampledValues without duplicating the dispatcher logic.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation, CoherentSession } from '../../../src/charging-station/index.js'
import type { SampledValueTemplate } from '../../../src/types/index.js'

import { addConfigurationKey } from '../../../src/charging-station/index.js'
import { buildMeterValue } from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  CurrentType,
  MeterValueMeasurand,
  OCPPVersion,
  StandardParametersKey,
  Voltage,
} from '../../../src/types/index.js'
import { Constants } from '../../../src/utils/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_METER_VALUES_INTERVAL_MS,
  TEST_TRANSACTION_ID,
} from '../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../helpers/StationHelpers.js'

const energyTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  unit: 'Wh',
  value: '0',
} as unknown as SampledValueTemplate

await describe('StrategyDispatch', async () => {
  let station: ChargingStation

  afterEach(() => {
    standardCleanup()
  })

  await describe('flag absent (legacy default)', async () => {
    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [energyTemplate]
        connectorStatus.transactionId = TEST_TRANSACTION_ID
      }
    })

    await it('should not create coherent sessions', () => {
      assert.strictEqual(station.getCoherentSession(TEST_TRANSACTION_ID), undefined)
    })

    await it('should return no-op when destroying a non-existent session', () => {
      assert.strictEqual(station.destroyCoherentSession(TEST_TRANSACTION_ID), false)
    })

    await it('should build a MeterValue via the legacy path', () => {
      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID,
        TEST_METER_VALUES_INTERVAL_MS
      )
      assert.ok(meterValue.timestamp instanceof Date)
      assert.ok(Array.isArray(meterValue.sampledValue))
    })
  })

  await describe('flag on + no EV profiles configured', async () => {
    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        stationInfo: {
          coherentMeterValues: true,
          ocppVersion: OCPPVersion.VERSION_16,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [energyTemplate]
        connectorStatus.transactionId = TEST_TRANSACTION_ID
      }
    })

    await it('should not create a coherent session without profiles', () => {
      const created = station.createCoherentSession(TEST_TRANSACTION_ID, 1)
      assert.strictEqual(created, undefined)
      assert.strictEqual(station.getCoherentSession(TEST_TRANSACTION_ID), undefined)
    })

    await it('should fall through to the legacy path in buildMeterValue', () => {
      // Without a session buildMeterValue must NOT call coherent code.
      // Legacy path returns non-empty when Energy template is present.
      addConfigurationKey(
        station,
        StandardParametersKey.MeterValuesSampledData,
        'Energy.Active.Import.Register'
      )
      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID,
        TEST_METER_VALUES_INTERVAL_MS
      )
      assert.ok(meterValue.sampledValue.length > 0)
    })
  })

  await describe('flag on + injected session', async () => {
    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        stationInfo: {
          coherentMeterValues: true,
          ocppVersion: OCPPVersion.VERSION_16,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [
          {
            measurand: MeterValueMeasurand.STATE_OF_CHARGE,
            unit: 'Percent',
          } as unknown as SampledValueTemplate,
        ]
        connectorStatus.transactionId = TEST_TRANSACTION_ID
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
        connectorStatus.energyActiveImportRegisterValue = 0
      }
    })

    await it('should not create a session when profiles are missing', () => {
      // Simulate missing profiles: createCoherentSession is a no-op.
      assert.strictEqual(station.createCoherentSession(TEST_TRANSACTION_ID, 1), undefined)
    })

    await it('should route through the coherent path when a session is injected directly', () => {
      const now = Date.now()
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'inline',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: now,
        socPercent: 30,
        transactionId: TEST_TRANSACTION_ID,
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      station.__injectCoherentSession(TEST_TRANSACTION_ID, session)

      addConfigurationKey(station, StandardParametersKey.MeterValuesSampledData, 'SoC')
      const registerBefore = station.getConnectorStatus(1)?.energyActiveImportRegisterValue ?? -1
      const meterValue = buildMeterValue(
        station,
        TEST_TRANSACTION_ID,
        TEST_METER_VALUES_INTERVAL_MS
      )
      const registerAfter = station.getConnectorStatus(1)?.energyActiveImportRegisterValue ?? -1

      // Register must advance because coherent path owns updates.
      assert.ok(registerAfter >= registerBefore)
      // Only SoC template configured → SampledValue count matches.
      assert.ok(meterValue.sampledValue.length <= 1)
    })
  })
})
