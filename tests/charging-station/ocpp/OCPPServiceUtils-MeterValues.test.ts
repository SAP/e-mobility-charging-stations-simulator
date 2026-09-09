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
 * - clock-aligned register phase suppression — effective OCPP 2.0 output identity
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'

import { addConfigurationKey, buildConfigKey } from '../../../src/charging-station/index.js'
import {
  buildClockAlignedConnectorMeterValue,
  buildMeterValue,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  CurrentType,
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPPVersion,
  type SampledValueTemplate,
  StandardParametersKey,
} from '../../../src/types/index.js'
import { Constants } from '../../../src/utils/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_ID,
  TEST_TRANSACTION_ID_STRING,
} from '../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../helpers/StationHelpers.js'

const energyTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  unit: 'Wh',
  value: '0',
} as unknown as SampledValueTemplate

const socTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.STATE_OF_CHARGE,
  unit: 'Percent',
  value: '75',
} as unknown as SampledValueTemplate

const voltageTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.VOLTAGE,
  unit: 'V',
  value: '230',
} as unknown as SampledValueTemplate

const powerTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.POWER_ACTIVE_IMPORT,
  unit: 'W',
  value: '11000',
} as unknown as SampledValueTemplate

const currentTemplate: SampledValueTemplate = {
  measurand: MeterValueMeasurand.CURRENT_IMPORT,
  unit: 'A',
  value: '16',
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

    await it('should resolve connectorId from transactionId and build meter value', () => {
      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID, 0)

      assert.ok(meterValue.timestamp instanceof Date)
      assert.ok(Array.isArray(meterValue.sampledValue))
    })

    await it('should project OCPP 1.6 DC inlet register energy', () => {
      assert.ok(station.stationInfo != null)
      station.stationInfo.conversionEfficiency = 0.8
      station.stationInfo.currentOutType = CurrentType.DC
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 800
      connectorStatus.transactionEnergyActiveImportRegisterValue = 800
      connectorStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          location: MeterValueLocation.INLET,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: MeterValueUnit.WATT_HOUR,
        },
      ] as unknown as SampledValueTemplate[]

      const meterValue = buildMeterValue(station, TEST_TRANSACTION_ID, 0)

      assert.strictEqual(meterValue.sampledValue[0]?.value, '1000')
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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

    await it('should treat physical DC energy as output-side when advancing the station main register', () => {
      const advanceAtLocation = (location: MeterValueLocation): number => {
        const { station: testStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        assert.ok(testStation.stationInfo != null)
        testStation.stationInfo.conversionEfficiency = 0.8
        testStation.stationInfo.currentOutType = CurrentType.DC
        const connectorStatus = testStation.getConnectorStatus(1)
        assert.ok(connectorStatus != null)
        connectorStatus.energyActiveImportRegisterValue = 0
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
        connectorStatus.transactionId = TEST_TRANSACTION_ID_STRING
        connectorStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            location,
            measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '1000',
          },
        ] as unknown as SampledValueTemplate[]

        buildMeterValue(testStation, TEST_TRANSACTION_ID_STRING, 3_600_000)

        return (
          testStation.getEvseStatus(0)?.connectors.get(0)?.energyActiveImportRegisterValue ?? -1
        )
      }

      assert.strictEqual(advanceAtLocation(MeterValueLocation.INLET), 1250)
      assert.strictEqual(advanceAtLocation(MeterValueLocation.OUTLET), 1250)
    })

    await it('should suppress register phases by effective OCPP 2.0 output identity', () => {
      addConfigurationKey(
        station,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.RegisterValuesWithoutPhases
        ),
        'true',
        undefined,
        { overwrite: true }
      )
      const sensorA = { channel: { label: 'main', number: 1 }, vendorId: 'sensor-a' }
      const reorderedSensorA = Object.assign(
        {},
        { vendorId: 'sensor-a' },
        { channel: Object.assign({}, { number: 1 }, { label: 'main' }) }
      )
      const templates = [
        {
          context: MeterValueContext.SAMPLE_PERIODIC,
          customData: reorderedSensorA,
          format: 'Raw',
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L1_N,
        },
        {
          context: MeterValueContext.TRANSACTION_BEGIN,
          customData: sensorA,
          format: 'SignedData',
          location: MeterValueLocation.OUTLET,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L2_N,
          unit: MeterValueUnit.WATT_HOUR,
        },
        {
          context: MeterValueContext.TRANSACTION_END,
          customData: sensorA,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L3_N,
        },
        {
          customData: sensorA,
          location: MeterValueLocation.INLET,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L1_N,
        },
        {
          customData: sensorA,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L2_N,
          unit: MeterValueUnit.KILO_WATT_HOUR,
        },
        {
          customData: { vendorId: 'sensor-b' },
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L3_N,
        },
      ] as unknown as SampledValueTemplate[]

      const meterValue = buildClockAlignedConnectorMeterValue(
        station,
        {
          connectorId: 1,
          energyRegisterWhOverride: 6000,
          evseId: 1,
          sampledValueBaseline: [],
          sampledValueTemplates: templates,
        },
        60_000,
        undefined,
        MeterValueContext.SAMPLE_CLOCK
      )

      assert.strictEqual(meterValue.sampledValue.length, 4)
      assert.ok(
        meterValue.sampledValue.every(
          sample =>
            sample.context === MeterValueContext.SAMPLE_CLOCK &&
            sample.phase == null &&
            !('format' in sample)
        )
      )
      assert.deepEqual(
        meterValue.sampledValue
          .map(sample =>
            [sample.customData?.vendorId, sample.location, sample.unitOfMeasure?.unit].join('|')
          )
          .sort(),
        [
          `sensor-a|${MeterValueLocation.INLET}|${MeterValueUnit.WATT_HOUR}`,
          `sensor-a|${MeterValueLocation.OUTLET}|${MeterValueUnit.KILO_WATT_HOUR}`,
          `sensor-a|${MeterValueLocation.OUTLET}|${MeterValueUnit.WATT_HOUR}`,
          `sensor-b|${MeterValueLocation.OUTLET}|${MeterValueUnit.WATT_HOUR}`,
        ].sort()
      )
    })
  })

  // Builder output tests — version-parameterized
  const VERSIONS = [
    { transactionId: TEST_TRANSACTION_ID, useEvses: false, version: OCPPVersion.VERSION_16 },
    { transactionId: TEST_TRANSACTION_ID_STRING, useEvses: true, version: OCPPVersion.VERSION_201 },
  ] as const

  for (const { transactionId, useEvses, version } of VERSIONS) {
    await describe(`builder output — ${version}`, async () => {
      const createStation = (templates: SampledValueTemplate[]): ChargingStation => {
        const opts = useEvses
          ? {
              baseName: TEST_CHARGING_STATION_BASE_NAME,
              connectorsCount: 1,
              evseConfiguration: { evsesCount: 1 },
              stationInfo: { ocppVersion: version },
              websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
            }
          : {
              baseName: TEST_CHARGING_STATION_BASE_NAME,
              connectorsCount: 1,
              stationInfo: { ocppVersion: version },
              websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
            }
        const { station: s } = createMockChargingStation(opts)
        const connectorStatus = s.getConnectorStatus(1)
        if (connectorStatus != null) {
          connectorStatus.MeterValues = templates
          connectorStatus.transactionId = transactionId
        }
        return s
      }

      await it('should propagate context to all sampled values', () => {
        // Arrange
        const s = createStation([energyTemplate])

        // Act
        const meterValue = buildMeterValue(
          s,
          transactionId,
          0,
          undefined,
          MeterValueContext.TRANSACTION_BEGIN
        )

        // Assert
        for (const sampledValue of meterValue.sampledValue) {
          assert.strictEqual(sampledValue.context, MeterValueContext.TRANSACTION_BEGIN)
        }
      })

      await it('should build sampled values in correct measurand order', () => {
        // Arrange
        const s = createStation([
          socTemplate,
          voltageTemplate,
          powerTemplate,
          currentTemplate,
          energyTemplate,
        ])
        addConfigurationKey(
          s,
          StandardParametersKey.MeterValuesSampledData,
          'SoC,Voltage,Power.Active.Import,Current.Import,Energy.Active.Import.Register'
        )

        // Act
        const meterValue = buildMeterValue(s, transactionId, 0)

        // Assert
        const measurands = meterValue.sampledValue.map(sv => sv.measurand)
        const socIdx = measurands.indexOf(MeterValueMeasurand.STATE_OF_CHARGE)
        const voltageIdx = measurands.indexOf(MeterValueMeasurand.VOLTAGE)
        const powerIdx = measurands.indexOf(MeterValueMeasurand.POWER_ACTIVE_IMPORT)
        const currentIdx = measurands.indexOf(MeterValueMeasurand.CURRENT_IMPORT)
        const energyIdx = measurands.indexOf(MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
        assert.ok(socIdx < voltageIdx, 'SoC should come before Voltage')
        assert.ok(voltageIdx < powerIdx, 'Voltage should come before Power')
        assert.ok(powerIdx < currentIdx, 'Power should come before Current')
        assert.ok(currentIdx < energyIdx, 'Current should come before Energy')
      })

      await it('should produce version-specific sampled value format', () => {
        // Arrange
        const s = createStation([energyTemplate])

        // Act
        const meterValue = buildMeterValue(s, transactionId, 0)

        // Assert
        assert.ok(meterValue.sampledValue.length > 0, 'should have at least one sampled value')
        const sampledValue = meterValue.sampledValue[0]
        if (version === OCPPVersion.VERSION_16) {
          assert.strictEqual(typeof sampledValue.value, 'string')
          assert.ok('unit' in sampledValue)
        } else {
          assert.strictEqual(typeof sampledValue.value, 'number')
          assert.ok('unitOfMeasure' in sampledValue)
        }
      })
    })
  }
})
