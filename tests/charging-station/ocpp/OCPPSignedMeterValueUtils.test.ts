/**
 * @file Tests for OCPPSignedMeterValueUtils
 * @description Unit tests for PublicKeyWithSignedMeterValueEnumType and shouldIncludePublicKey helper
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  deriveSigningMethodFromPublicKeyHex,
  shouldIncludePublicKey,
  validateSigningPrerequisites,
} from '../../../src/charging-station/ocpp/OCPPSignedMeterValueUtils.js'
import {
  PublicKeyWithSignedMeterValueEnumType,
  SigningMethodEnumType,
} from '../../../src/types/index.js'
import { TEST_PUBLIC_KEY_HEX } from '../ChargingStationTestConstants.js'

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

  await describe('deriveSigningMethodFromPublicKeyHex', async () => {
    await it('should derive secp256k1 from OCA spec §5.3 public key', () => {
      assert.strictEqual(
        deriveSigningMethodFromPublicKeyHex(TEST_PUBLIC_KEY_HEX),
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
    })

    await it('should derive secp256r1 from valid prime256v1 key', () => {
      const secp256r1Key =
        '3059301306072a8648ce3d020106082a8648ce3d03010703420004effb01ac755dad9574b89873e42e9f2f7a33a3b106f2d1662d0909a16f1e5a5355b022fec98119f1877b958f2240fc9c0e113cb94ee75b44c9ef79c9ed8627e0'
      assert.strictEqual(
        deriveSigningMethodFromPublicKeyHex(secp256r1Key),
        SigningMethodEnumType.ECDSA_secp256r1_SHA256
      )
    })

    await it('should handle mixed case hex', () => {
      assert.strictEqual(
        deriveSigningMethodFromPublicKeyHex(TEST_PUBLIC_KEY_HEX.toUpperCase()),
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
    })

    await it('should return undefined for unrecognized key', () => {
      assert.strictEqual(deriveSigningMethodFromPublicKeyHex('deadbeef'), undefined)
    })

    await it('should return undefined for empty string', () => {
      assert.strictEqual(deriveSigningMethodFromPublicKeyHex(''), undefined)
    })
  })

  await describe('validateSigningPrerequisites', async () => {
    await it('should return enabled with derived method when no configured method', () => {
      const result = validateSigningPrerequisites(TEST_PUBLIC_KEY_HEX, undefined)
      assert.strictEqual(result.enabled, true)
      assert.strictEqual(
        (result as { signingMethod: SigningMethodEnumType }).signingMethod,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
    })

    await it('should return enabled when configured method matches key curve', () => {
      const result = validateSigningPrerequisites(
        TEST_PUBLIC_KEY_HEX,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      assert.strictEqual(result.enabled, true)
    })

    await it('should return disabled when public key is undefined', () => {
      const result = validateSigningPrerequisites(undefined, undefined)
      assert.strictEqual(result.enabled, false)
      assert.ok((result as { reason: string }).reason.includes('Public key'))
    })

    await it('should return disabled when public key is empty', () => {
      const result = validateSigningPrerequisites('', undefined)
      assert.strictEqual(result.enabled, false)
    })

    await it('should return disabled when key has unrecognized curve', () => {
      const result = validateSigningPrerequisites('deadbeef', undefined)
      assert.strictEqual(result.enabled, false)
      assert.ok((result as { reason: string }).reason.includes('Cannot derive'))
    })

    await it('should return disabled when configured method mismatches key curve', () => {
      const result = validateSigningPrerequisites(
        TEST_PUBLIC_KEY_HEX,
        SigningMethodEnumType.ECDSA_secp256r1_SHA256
      )
      assert.strictEqual(result.enabled, false)
      assert.ok((result as { reason: string }).reason.includes('mismatch'))
    })
  })
})
