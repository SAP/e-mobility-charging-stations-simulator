/**
 * @file Tests for OCPPServiceUtils buildMeterValue
 * @description Verifies buildMeterValue resolves connectorId/evseId from transactionId
 *   and that getSampledValueTemplate handles EVSE-level and connector-level templates
 *
 * Covers:
 * - buildMeterValue — resolves connectorId from transactionId for OCPP 1.6
 * - buildMeterValue — resolves connectorId + evseId from transactionId for OCPP 2.0
 * - buildMeterValue — throws when transactionId not found
 * - getSampledValueTemplate — EVSE-level templates take priority over connector-level
 * - getSampledValueTemplate — merges connector templates when no EVSE-level templates
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'

import { buildMeterValue } from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  MeterValueMeasurand,
  OCPPVersion,
  type SampledValueTemplate,
} from '../../../src/types/index.js'
import { Constants } from '../../../src/utils/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_ID,
  TEST_TRANSACTION_ID_STRING,
} from '../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

const energyTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  unit: 'Wh',
  value: '0',
} as unknown as SampledValueTemplate

await describe('buildMeterValue', async () => {
  let station: ChargingStation

  afterEach(() => {
    standardCleanup()
  })

  await describe('OCPP 1.6', async () => {
    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [energyTemplate]
        connectorStatus.transactionId = TEST_TRANSACTION_ID
      }
    })

    await it('should resolve connectorId from transactionId and build meter value', () => {
      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID, 0)

      assert.ok(meterValue.timestamp instanceof Date)
      assert.ok(Array.isArray(meterValue.sampledValue))
    })

    await it('should throw when transactionId not found', () => {
      assert.throws(
        () => buildMeterValue(station, 999, 0),
        (error: Error) => {
          assert.ok(error.message.includes('no connector found'))
          return true
        }
      )
    })
  })

  await describe('OCPP 2.0', async () => {
    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [energyTemplate]
        connectorStatus.transactionId = TEST_TRANSACTION_ID_STRING
      }
    })

    await it('should resolve connectorId and evseId from transactionId', () => {
      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      assert.ok(meterValue.timestamp instanceof Date)
      assert.ok(Array.isArray(meterValue.sampledValue))
    })

    await it('should throw when transactionId not found', () => {
      assert.throws(
        () => buildMeterValue(station, 'unknown-tx', 0),
        (error: Error) => {
          assert.ok(error.message.includes('no connector'))
          return true
        }
      )
    })

    await it('should use EVSE-level MeterValues templates when available', () => {
      const evseStatus = station.getEvseStatus(1)
      if (evseStatus != null) {
        evseStatus.MeterValues = [energyTemplate]
        // Clear connector-level templates to prove EVSE-level is used
        for (const connectorStatus of evseStatus.connectors.values()) {
          connectorStatus.MeterValues = []
        }
      }

      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      assert.ok(meterValue.timestamp instanceof Date)
      assert.ok(Array.isArray(meterValue.sampledValue))
      assert.ok(
        meterValue.sampledValue.length > 0,
        'should have sampled values from EVSE-level template'
      )
    })

    await it('should merge connector templates when no EVSE-level templates', () => {
      const evseStatus = station.getEvseStatus(1)
      if (evseStatus != null) {
        evseStatus.MeterValues = undefined
      }

      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID_STRING, 0)

      assert.ok(meterValue.timestamp instanceof Date)
      assert.ok(Array.isArray(meterValue.sampledValue))
      assert.ok(
        meterValue.sampledValue.length > 0,
        'should have sampled values from connector templates'
      )
    })
  })
})
