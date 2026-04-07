/**
 * @file Tests for OCPP16VendorParametersKey enum
 * @description Unit tests for signed meter values vendor configuration keys
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { OCPP16VendorParametersKey } from '../../../../src/types/index.js'

await describe('OCPP16VendorParametersKey', async () => {
  await it('should have AlignedDataSignReadings key', () => {
    assert.strictEqual(OCPP16VendorParametersKey.AlignedDataSignReadings, 'AlignedDataSignReadings')
  })

  await it('should have AlignedDataSignUpdatedReadings key', () => {
    assert.strictEqual(
      OCPP16VendorParametersKey.AlignedDataSignUpdatedReadings,
      'AlignedDataSignUpdatedReadings'
    )
  })

  await it('should have ConnectionUrl key', () => {
    assert.strictEqual(OCPP16VendorParametersKey.ConnectionUrl, 'ConnectionUrl')
  })

  await it('should have MeterPublicKey key', () => {
    assert.strictEqual(OCPP16VendorParametersKey.MeterPublicKey, 'MeterPublicKey')
  })

  await it('should have PublicKeyWithSignedMeterValue key', () => {
    assert.strictEqual(
      OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
      'PublicKeyWithSignedMeterValue'
    )
  })

  await it('should have SampledDataSignReadings key', () => {
    assert.strictEqual(OCPP16VendorParametersKey.SampledDataSignReadings, 'SampledDataSignReadings')
  })

  await it('should have SampledDataSignStartedReadings key', () => {
    assert.strictEqual(
      OCPP16VendorParametersKey.SampledDataSignStartedReadings,
      'SampledDataSignStartedReadings'
    )
  })

  await it('should have SampledDataSignUpdatedReadings key', () => {
    assert.strictEqual(
      OCPP16VendorParametersKey.SampledDataSignUpdatedReadings,
      'SampledDataSignUpdatedReadings'
    )
  })

  await it('should have StartTxnSampledData key', () => {
    assert.strictEqual(OCPP16VendorParametersKey.StartTxnSampledData, 'StartTxnSampledData')
  })
})
