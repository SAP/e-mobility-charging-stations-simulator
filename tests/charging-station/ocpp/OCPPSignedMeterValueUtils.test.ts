/**
 * @file Tests for SignedMeterValueUtils
 * @description Unit tests for PublicKeyWithSignedMeterValueEnumType and shouldIncludePublicKey helper
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { shouldIncludePublicKey } from '../../../src/charging-station/ocpp/OCPPSignedMeterValueUtils.js'
import { PublicKeyWithSignedMeterValueEnumType } from '../../../src/types/index.js'

await describe('SignedMeterValueUtils', async () => {
  await describe('PublicKeyWithSignedMeterValueEnumType', async () => {
    await it('should have EveryMeterValue value', () => {
      assert.strictEqual(PublicKeyWithSignedMeterValueEnumType.EveryMeterValue, 'EveryMeterValue')
    })

    await it('should have Never value', () => {
      assert.strictEqual(PublicKeyWithSignedMeterValueEnumType.Never, 'Never')
    })

    await it('should have OncePerTransaction value', () => {
      assert.strictEqual(
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction,
        'OncePerTransaction'
      )
    })

    await it('should have exactly 3 values', () => {
      const values = Object.values(PublicKeyWithSignedMeterValueEnumType)
      assert.strictEqual(values.length, 3)
    })
  })

  await describe('shouldIncludePublicKey', async () => {
    await it('should return false when config is Never and key not sent', () => {
      assert.strictEqual(
        shouldIncludePublicKey(PublicKeyWithSignedMeterValueEnumType.Never, false),
        false
      )
    })

    await it('should return false when config is Never and key already sent', () => {
      assert.strictEqual(
        shouldIncludePublicKey(PublicKeyWithSignedMeterValueEnumType.Never, true),
        false
      )
    })

    await it('should return true when config is EveryMeterValue and key not sent', () => {
      assert.strictEqual(
        shouldIncludePublicKey(PublicKeyWithSignedMeterValueEnumType.EveryMeterValue, false),
        true
      )
    })

    await it('should return true when config is EveryMeterValue and key already sent', () => {
      assert.strictEqual(
        shouldIncludePublicKey(PublicKeyWithSignedMeterValueEnumType.EveryMeterValue, true),
        true
      )
    })

    await it('should return true when config is OncePerTransaction and key not sent', () => {
      assert.strictEqual(
        shouldIncludePublicKey(PublicKeyWithSignedMeterValueEnumType.OncePerTransaction, false),
        true
      )
    })

    await it('should return false when config is OncePerTransaction and key already sent', () => {
      assert.strictEqual(
        shouldIncludePublicKey(PublicKeyWithSignedMeterValueEnumType.OncePerTransaction, true),
        false
      )
    })
  })
})
