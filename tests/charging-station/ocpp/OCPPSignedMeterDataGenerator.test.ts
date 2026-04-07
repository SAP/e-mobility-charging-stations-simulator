/**
 * @file Tests for SignedMeterDataGenerator
 * @description Verifies OCMF-like signed meter data generation for simulation purposes.
 *
 * Covers:
 * - generateSignedMeterData — output structure and field values
 * - generateSignedMeterData — signedMeterData is valid Base64 containing OCMF payload
 * - generateSignedMeterData — publicKey handling with and without publicKeyHex
 * - generateSignedMeterData — TX codes for different contexts
 * - generateSignedMeterData — different meterValues produce different output
 * - buildPublicKeyValue — produces valid Base64 containing oca:base16:asn1: prefix
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildPublicKeyValue,
  generateSignedMeterData,
  type SignedMeterDataParams,
} from '../../../src/charging-station/ocpp/OCPPSignedMeterDataGenerator.js'
import { MeterValueContext, MeterValueUnit } from '../../../src/types/index.js'

const DEFAULT_PARAMS: SignedMeterDataParams = {
  context: MeterValueContext.SAMPLE_PERIODIC,
  meterSerialNumber: 'SIM-METER-001',
  meterValue: 12345000,
  timestamp: new Date('2025-01-15T10:30:00.000Z'),
  transactionId: 42,
}

const TEST_PUBLIC_KEY_HEX = '3059301306072a8648ce3d020106082a8648ce3d03010703420004abc123'

await describe('SignedMeterDataGenerator', async () => {
  await it('should return an object with all required fields', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)

    assert.ok('encodingMethod' in result)
    assert.ok('publicKey' in result)
    assert.ok('signedMeterData' in result)
    assert.ok('signingMethod' in result)
  })

  await it('should produce valid Base64 in signedMeterData', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)
    const reEncoded = Buffer.from(Buffer.from(result.signedMeterData, 'base64')).toString('base64')

    assert.strictEqual(result.signedMeterData, reEncoded)
  })

  await it('should produce signedMeterData that decodes to an OCMF string', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)
    const decoded = Buffer.from(result.signedMeterData, 'base64').toString('utf8')

    assert.ok(decoded.startsWith('OCMF|'))
  })

  await it('should set signingMethod to empty string when included in signedMeterData', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)

    assert.strictEqual(result.signingMethod, '')
  })

  await it('should set encodingMethod to OCMF', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)

    assert.strictEqual(result.encodingMethod, 'OCMF')
  })

  await it('should return empty publicKey when no publicKeyHex provided', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)

    assert.strictEqual(result.publicKey, '')
  })

  await it('should return non-empty publicKey when publicKeyHex provided', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS, TEST_PUBLIC_KEY_HEX)

    assert.ok(result.publicKey.length > 0)
  })

  await it('should produce valid Base64 containing oca:base16:asn1: in buildPublicKeyValue', () => {
    const result = buildPublicKeyValue(TEST_PUBLIC_KEY_HEX)
    const reEncoded = Buffer.from(Buffer.from(result, 'base64')).toString('base64')

    assert.strictEqual(result, reEncoded)

    const decoded = Buffer.from(result, 'base64').toString('utf8')
    assert.ok(decoded.includes('oca:base16:asn1:'))
  })

  await it('should produce TX=B for Transaction.Begin', () => {
    const params: SignedMeterDataParams = {
      ...DEFAULT_PARAMS,
      context: MeterValueContext.TRANSACTION_BEGIN,
    }
    const result = generateSignedMeterData(params)
    const decoded = Buffer.from(result.signedMeterData, 'base64').toString('utf8')

    assert.ok(decoded.includes('"TX":"B"'))
  })

  await it('should produce TX=E for Transaction.End', () => {
    const params: SignedMeterDataParams = {
      ...DEFAULT_PARAMS,
      context: MeterValueContext.TRANSACTION_END,
    }
    const result = generateSignedMeterData(params)
    const decoded = Buffer.from(result.signedMeterData, 'base64').toString('utf8')

    assert.ok(decoded.includes('"TX":"E"'))
  })

  await it('should produce TX=P for Sample.Periodic', () => {
    const result = generateSignedMeterData(DEFAULT_PARAMS)
    const decoded = Buffer.from(result.signedMeterData, 'base64').toString('utf8')

    assert.ok(decoded.includes('"TX":"P"'))
  })

  await it('should produce TX=P for Sample.Clock', () => {
    const params: SignedMeterDataParams = {
      ...DEFAULT_PARAMS,
      context: MeterValueContext.SAMPLE_CLOCK,
    }
    const result = generateSignedMeterData(params)
    const decoded = Buffer.from(result.signedMeterData, 'base64').toString('utf8')

    assert.ok(decoded.includes('"TX":"P"'))
  })

  await it('should produce different signedMeterData for different meterValues', () => {
    const result1 = generateSignedMeterData(DEFAULT_PARAMS)
    const result2 = generateSignedMeterData({ ...DEFAULT_PARAMS, meterValue: 99999000 })

    assert.notStrictEqual(result1.signedMeterData, result2.signedMeterData)
  })

  await it('should handle kWh input without double-dividing', () => {
    const whParams: SignedMeterDataParams = { ...DEFAULT_PARAMS, meterValue: 12345 }
    const kwhParams: SignedMeterDataParams = {
      ...DEFAULT_PARAMS,
      meterValue: 12.345,
      meterValueUnit: MeterValueUnit.KILO_WATT_HOUR,
    }
    const whResult = generateSignedMeterData(whParams)
    const kwhResult = generateSignedMeterData(kwhParams)
    const whDecoded = Buffer.from(whResult.signedMeterData, 'base64').toString('utf8')
    const kwhDecoded = Buffer.from(kwhResult.signedMeterData, 'base64').toString('utf8')

    assert.ok(whDecoded.includes('"RV":12.345'))
    assert.ok(kwhDecoded.includes('"RV":12.345'))
  })
})
