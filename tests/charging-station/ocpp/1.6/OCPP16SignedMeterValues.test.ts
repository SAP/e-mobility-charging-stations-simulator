/**
 * @file Tests for OCPP 1.6 signed meter value support
 * @module OCPP 1.6 — Signed MeterValues (OCA Application Note v1.0)
 * @description Verifies signed meter value integration in transaction begin/end functions,
 * buildSignedOCPP16SampledValue, and periodic meter values.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { buildSignedOCPP16SampledValue } from '../../../../src/charging-station/ocpp/1.6/OCPP16RequestBuilders.js'
import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  OCPP16MeterValueContext,
  OCPP16MeterValueFormat,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  type OCPP16SignedMeterValue,
  OCPP16VendorParametersKey,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
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
        encodingMethod: 'OCMF',
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: 'ECDSA-secp256r1-SHA256',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_BEGIN,
        signedData
      )

      assert.strictEqual(result.format, OCPP16MeterValueFormat.SIGNED_DATA)
    })

    await it('should set measurand to Energy.Active.Import.Register', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: 'OCMF',
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: 'ECDSA-secp256r1-SHA256',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_END,
        signedData
      )

      assert.strictEqual(result.measurand, OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
    })

    await it('should set location to Outlet', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: 'OCMF',
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: 'ECDSA-secp256r1-SHA256',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.SAMPLE_PERIODIC,
        signedData
      )

      assert.strictEqual(result.location, OCPP16MeterValueLocation.OUTLET)
    })

    await it('should set value to JSON-serialized SignedMeterValue', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: 'OCMF',
        publicKey: 'abc123',
        signedMeterData: 'dGVzdA==',
        signingMethod: 'ECDSA-secp256r1-SHA256',
      }

      const result = buildSignedOCPP16SampledValue(
        OCPP16MeterValueContext.TRANSACTION_BEGIN,
        signedData
      )

      const parsed = JSON.parse(result.value) as OCPP16SignedMeterValue
      assert.strictEqual(parsed.encodingMethod, 'OCMF')
      assert.strictEqual(parsed.signingMethod, 'ECDSA-secp256r1-SHA256')
      assert.strictEqual(parsed.signedMeterData, 'dGVzdA==')
      assert.strictEqual(parsed.publicKey, 'abc123')
    })

    await it('should use the provided context', () => {
      const signedData: OCPP16SignedMeterValue = {
        encodingMethod: 'OCMF',
        publicKey: '',
        signedMeterData: 'dGVzdA==',
        signingMethod: 'ECDSA-secp256r1-SHA256',
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
    await it('should not include signed SampledValue when signing is disabled', () => {
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

      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 0)
    })

    await it('should include signed SampledValue when SampledDataSignReadings and SampledDataSignStartedReadings are true', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
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

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')

      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 0)
    })

    await it('should set publicKeySentInTransaction=true after signing begin value', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
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
      upsertConfigurationKey(station, `${OCPP16VendorParametersKey.MeterPublicKey}1`, 'abcd1234')

      OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 0)

      assert.strictEqual(connectorStatus?.publicKeySentInTransaction, true)
    })
  })

  // ─── buildTransactionEndMeterValue with signing ─────────────────────────

  await describe('buildTransactionEndMeterValue — signing', async () => {
    await it('should not include signed SampledValue when signing is disabled', () => {
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

      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 10000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 0)
    })

    await it('should include signed SampledValue when SampledDataSignReadings=true', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
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
        connectorStatus.transactionId = 42
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')

      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 50000)

      const signedSamples = meterValue.sampledValue.filter(
        sv => sv.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      assert.strictEqual(signedSamples.length, 1)
      assert.strictEqual(signedSamples[0].context, OCPP16MeterValueContext.TRANSACTION_END)
    })

    await it('should produce signed SampledValue with valid JSON containing all 4 fields', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
        },
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
        connectorStatus.transactionId = 99
      }

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')

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
      assert.strictEqual(parsed.encodingMethod, 'OCMF')
      assert.strictEqual(parsed.signingMethod, 'ECDSA-secp256r1-SHA256')
    })
  })

  // ─── isSigningEnabled ───────────────────────────────────────────────────

  await describe('isSigningEnabled', async () => {
    await it('should return false when SampledDataSignReadings is not configured', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })

      assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), false)
    })

    await it('should return true when SampledDataSignReadings=true', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')

      assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), true)
    })

    await it('should return false when SampledDataSignReadings=false', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })

      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'false')

      assert.strictEqual(OCPP16ServiceUtils.isSigningEnabled(station), false)
    })
  })
})
