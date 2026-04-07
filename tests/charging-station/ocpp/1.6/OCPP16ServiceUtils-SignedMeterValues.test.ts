/**
 * @file Tests for OCPP16ServiceUtils signed meter value support
 * @module OCPP 1.6 — Signed MeterValues (OCA Application Note v1.0)
 * @description Verifies signed meter value integration in transaction begin/end functions,
 * buildSignedOCPP16SampledValue, and periodic meter values.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { buildSignedOCPP16SampledValue } from '../../../../src/charging-station/ocpp/1.6/OCPP16RequestBuilders.js'
import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  EncodingMethodEnumType,
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueFormat,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  type OCPP16SampledValue,
  type OCPP16SignedMeterValue,
  OCPP16VendorParametersKey,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { standardCleanup, withMockTimers } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_PUBLIC_KEY_HEX } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMeterValuesTemplate, upsertConfigurationKey } from './OCPP16TestUtils.js'

await describe('OCPP 1.6 — Signed MeterValues', async () => {
  afterEach(() => {
    standardCleanup()
  })

  // ─── buildSignedOCPP16SampledValue ──────────────────────────────────────

  await describe('buildSignedOCPP16SampledValue', async () => {
    await it('should return SampledValue with format=SignedData', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: EncodingMethodEnumType.OCMF,
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: '',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_BEGIN,
        signedData
      )

      assert.strictEqual(result.format, OCPP16MeterValueFormat.SIGNED_DATA)
    })

    await it('should set measurand to Energy.Active.Import.Register', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: EncodingMethodEnumType.OCMF,
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: '',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_END,
        signedData
      )

      assert.strictEqual(result.measurand, OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
    })

    await it('should set location to Outlet', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: EncodingMethodEnumType.OCMF,
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: '',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.SAMPLE_PERIODIC,
        signedData
      )

      assert.strictEqual(result.location, OCPP16MeterValueLocation.OUTLET)
    })

    await it('should set value to JSON-serialized SignedMeterValue', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: EncodingMethodEnumType.OCMF,
        publicKey: 'abc123',
        signedMeterData: 'dGVzdA==',
        signingMethod: '',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_BEGIN,
        signedData
      )

      const parsed = JSON.parse(result.value) as OCPP16SignedMeterValue
      assert.strictEqual(parsed.encodingMethod, EncodingMethodEnumType.OCMF)
      assert.strictEqual(parsed.signingMethod, '')
      assert.strictEqual(parsed.signedMeterData, 'dGVzdA==')
      assert.strictEqual(parsed.publicKey, 'abc123')
    })

    await it('should use the provided context', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: EncodingMethodEnumType.OCMF,
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: '',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_END,
        signedData
      )

      assert.strictEqual(result.context, OCPP16MeterValueContext.TRANSACTION_END)
    })
  })

  // ─── buildTransactionBeginMeterValue with signing ───────────────────────

  await describe('buildTransactionBeginMeterValue — signing', async () => {
    let station: ChargingStation

    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      station = s
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
    })

    await it('should not include signed SampledValue when signing is disabled', () => {
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 0)
    })

    await it('should include signed SampledValue when SampledDataSignReadings and SampledDataSignStartedReadings are true', () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 42
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.SampledDataSignStartedReadings,
        'true'
      )
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
        'EveryMeterValue'
      )

      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 1)
      assert.strictEqual(
        signedSamples[0].measurand,
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.strictEqual(signedSamples[0].context, OCPP16MeterValueContext.TRANSACTION_BEGIN)
    })

    await it('should not include signed SampledValue when SampledDataSignReadings=true but SampledDataSignStartedReadings=false', () => {
      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')

      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 0)
    })

    await it('should set publicKeySentInTransaction=true after signing begin value', () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 42
        connectorStatus.publicKeySentInTransaction = false
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.SampledDataSignStartedReadings,
        'true'
      )
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
        'OncePerTransaction'
      )
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )

      OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 0)

      assert.strictEqual(connectorStatus?.publicKeySentInTransaction, true)
    })
  })

  // ─── buildTransactionEndMeterValue with signing ─────────────────────────

  await describe('buildTransactionEndMeterValue — signing', async () => {
    let station: ChargingStation

    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      station = s
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
    })

    await it('should not include signed SampledValue when signing is disabled', () => {
      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 10000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 0)
    })

    await it('should include signed SampledValue when SampledDataSignReadings=true', () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 42
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )

      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 50000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 1)
      assert.strictEqual(signedSamples[0].context, OCPP16MeterValueContext.TRANSACTION_END)
    })

    await it('should produce signed SampledValue with valid JSON containing all 4 fields', () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 99
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )

      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 25000)
      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )

      assert.strictEqual(signedSamples.length, 1)
      const parsed = JSON.parse(signedSamples[0].value) as OCPP16SignedMeterValue
      assert.strictEqual(typeof parsed.encodingMethod, 'string')
      assert.strictEqual(typeof parsed.signingMethod, 'string')
      assert.strictEqual(typeof parsed.signedMeterData, 'string')
      assert.strictEqual(typeof parsed.publicKey, 'string')
      assert.strictEqual(parsed.encodingMethod, EncodingMethodEnumType.OCMF)
      assert.strictEqual(parsed.signingMethod, '')
    })
  })

  await describe('signing — spec edge cases', async () => {
    await describe('with standard energy config', async () => {
      let station: ChargingStation

      beforeEach(() => {
        const { station: s } = createMockChargingStation({
          ocppVersion: OCPPVersion.VERSION_16,
          stationInfo: {
            meterSerialNumber: 'SIM-001',
            ocppVersion: OCPPVersion.VERSION_16,
          },
        })
        station = s
        const connectorStatus = station.getConnectorStatus(1)
        if (connectorStatus != null) {
          connectorStatus.MeterValues = createMeterValuesTemplate([
            {
              measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
              unit: OCPP16MeterValueUnit.WATT_HOUR,
              value: '0',
            },
          ])
          connectorStatus.transactionId = 42
        }

        upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
        upsertConfigurationKey(
          station,
          `${OCPP16VendorParametersKey.MeterPublicKey}1`,
          TEST_PUBLIC_KEY_HEX
        )
      })

      await it('should not sign non-energy measurands even when signing is enabled', () => {
        const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 10000)
        const signedSamples = meterValue.sampledValue.filter(
          sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
        )

        assert.strictEqual(signedSamples.length, 1)
        for (const sv of signedSamples) {
          assert.strictEqual(sv.measurand, OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
        }
      })
    })

    await describe('with transactionDataMeterValues disabled', async () => {
      let station: ChargingStation

      beforeEach(() => {
        const { station: s } = createMockChargingStation({
          ocppVersion: OCPPVersion.VERSION_16,
          stationInfo: {
            meterSerialNumber: 'SIM-001',
            ocppVersion: OCPPVersion.VERSION_16,
            transactionDataMeterValues: false,
          },
        })
        station = s
        const connectorStatus = station.getConnectorStatus(1)
        if (connectorStatus != null) {
          connectorStatus.MeterValues = createMeterValuesTemplate([
            {
              measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
              unit: OCPP16MeterValueUnit.WATT_HOUR,
              value: '0',
            },
          ])
          connectorStatus.transactionId = 42
        }

        upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      })

      await it('should force transactionData when signing enabled even without energy template', () => {
        assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), true)
        assert.strictEqual(station.stationInfo?.transactionDataMeterValues, false)
      })
    })
  })

  await describe('startUpdatedMeterValues — periodic signing', async () => {
    let station: ChargingStation
    let capturedMeterValue: OCPP16MeterValue | undefined

    beforeEach(() => {
      capturedMeterValue = undefined
      const { station: s } = createMockChargingStation({
        ocppRequestService: {
          requestHandler: (...args: unknown[]): Promise<unknown> => {
            const payload = args[2] as undefined | { meterValue?: OCPP16MeterValue[] }
            if (payload?.meterValue?.[0] != null) {
              capturedMeterValue = payload.meterValue[0]
            }
            return Promise.resolve()
          },
        },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      station = s
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
        connectorStatus.transactionStarted = true
        connectorStatus.transactionId = 42
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )
    })

    await it('should include signed SampledValue in periodic meter values when SampledDataSignUpdatedReadings=true', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        upsertConfigurationKey(
          station,
          OCPP16VendorParametersKey.SampledDataSignUpdatedReadings,
          'true'
        )

        // Act
        OCPP16ServiceUtils.startUpdatedMeterValues(station, 1, 60)
        t.mock.timers.tick(60000)

        // Assert
        assert.ok(capturedMeterValue != null)
        const signedSamples = capturedMeterValue.sampledValue.filter(
          (sv: OCPP16SampledValue) => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
        )
        assert.ok(signedSamples.length > 0)
        assert.strictEqual(
          signedSamples[0].measurand,
          OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        )
      })
    })

    await it('should not include signed SampledValue when SampledDataSignUpdatedReadings=false', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        upsertConfigurationKey(
          station,
          OCPP16VendorParametersKey.SampledDataSignUpdatedReadings,
          'false'
        )

        // Act
        OCPP16ServiceUtils.startUpdatedMeterValues(station, 1, 60)
        t.mock.timers.tick(60000)

        // Assert
        assert.ok(capturedMeterValue != null)
        const signedSamples = capturedMeterValue.sampledValue.filter(
          (sv: OCPP16SampledValue) => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
        )
        assert.strictEqual(signedSamples.length, 0)
      })
    })
  })

  // ─── isSigningEnabled ───────────────────────────────────────────────────

  await describe('isSigningEnabled', async () => {
    let station: ChargingStation

    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      station = s
    })

    await it('should return false when SampledDataSignReadings is not configured', () => {
      assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), false)
    })

    await it('should return true when SampledDataSignReadings=true', () => {
      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')

      assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), true)
    })

    await it('should return false when SampledDataSignReadings=false', () => {
      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'false')

      assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), false)
    })
  })
})
