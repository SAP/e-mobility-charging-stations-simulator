/**
 * @file Tests for OCPP16ServiceUtils meter value building functions
 * @module OCPP 1.6 — §4.7 MeterValues (meter value building)
 * @description Verifies pure static methods on OCPP16ServiceUtils for meter value building:
 * buildTransactionBeginMeterValue, buildTransactionDataMeterValues, buildTransactionEndMeterValue.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { createMeterValuesTemplate } from './OCPP16TestUtils.js'

await describe('OCPP16ServiceUtils — MeterValues', async () => {
  afterEach(() => {
    standardCleanup()
  })

  // ─── buildTransactionBeginMeterValue ───────────────────────────────────

  await describe('buildTransactionBeginMeterValue', async () => {
    await it('should return a meter value with Transaction.Begin context when template exists', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      // Assert
      assert.notStrictEqual(meterValue, undefined)
      assert.ok(meterValue.timestamp instanceof Date)
      assert.strictEqual(Array.isArray(meterValue.sampledValue), true)
      assert.strictEqual(meterValue.sampledValue.length, 1)
      assert.strictEqual(
        meterValue.sampledValue[0].context,
        OCPP16MeterValueContext.TRANSACTION_BEGIN
      )
    })

    await it('should apply Wh unit divider of 1 for meterStart', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      // Assert — Wh divider is 1, so value = 5000 / 1 = 5000
      assert.strictEqual(meterValue.sampledValue[0].value, '5000')
    })

    await it('should apply kWh unit divider of 1000 for meterStart', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.KILO_WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      // Assert — kWh divider is 1000, so value = 5000 / 1000 = 5
      assert.strictEqual(meterValue.sampledValue[0].value, '5')
    })

    await it('should use meterStart 0 when undefined', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, undefined)

      // Assert — undefined meterStart defaults to 0
      assert.strictEqual(meterValue.sampledValue[0].value, '0')
    })

    await it('should throw when MeterValues template is empty (missing default measurand)', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })

      assert.throws(
        () => {
          OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 100)
        },
        { message: /Missing MeterValues for default measurand/ }
      )
    })
  })

  // ─── buildTransactionDataMeterValues ───────────────────────────────────

  await describe('buildTransactionDataMeterValues', async () => {
    await it('should return array containing both begin and end meter values', () => {
      // Arrange
      const beginMeterValue: OCPP16MeterValue = {
        sampledValue: [{ context: OCPP16MeterValueContext.TRANSACTION_BEGIN, value: '0' }],
        timestamp: new Date('2025-01-01T00:00:00Z'),
      } as OCPP16MeterValue
      const endMeterValue: OCPP16MeterValue = {
        sampledValue: [{ context: OCPP16MeterValueContext.TRANSACTION_END, value: '100' }],
        timestamp: new Date('2025-01-01T01:00:00Z'),
      } as OCPP16MeterValue

      // Act
      const result = OCPP16ServiceUtils.buildTransactionDataMeterValues(
        beginMeterValue,
        endMeterValue
      )

      // Assert
      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0], beginMeterValue)
      assert.strictEqual(result[1], endMeterValue)
    })

    await it('should return a new array instance', () => {
      const beginMeterValue: OCPP16MeterValue = {
        sampledValue: [],
        timestamp: new Date(),
      } as OCPP16MeterValue
      const endMeterValue: OCPP16MeterValue = {
        sampledValue: [],
        timestamp: new Date(),
      } as OCPP16MeterValue

      const result1 = OCPP16ServiceUtils.buildTransactionDataMeterValues(
        beginMeterValue,
        endMeterValue
      )
      const result2 = OCPP16ServiceUtils.buildTransactionDataMeterValues(
        beginMeterValue,
        endMeterValue
      )

      // Different array instances
      assert.notStrictEqual(result1, result2)
    })
  })

  // ─── buildTransactionEndMeterValue ─────────────────────────────────────

  await describe('buildTransactionEndMeterValue', async () => {
    await it('should return a meter value with Transaction.End context', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 10000)

      // Assert
      assert.notStrictEqual(meterValue, undefined)
      assert.ok(meterValue.timestamp instanceof Date)
      assert.strictEqual(meterValue.sampledValue.length, 1)
      assert.strictEqual(
        meterValue.sampledValue[0].context,
        OCPP16MeterValueContext.TRANSACTION_END
      )
    })

    await it('should apply kWh unit divider for end meter value', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.KILO_WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 3000)

      // Assert — kWh divider: 3000 / 1000 = 3
      assert.strictEqual(meterValue.sampledValue[0].value, '3')
    })
  })
})
