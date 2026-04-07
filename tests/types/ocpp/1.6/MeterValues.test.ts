/**
 * @file Tests for OCPP 1.6 MeterValues types
 * @description Tests for OCPP16MeterValueFormat enum and OCPP16SignedMeterValue interface
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  EncodingMethodEnumType,
  OCPP16MeterValueFormat,
  type OCPP16SignedMeterValue,
  SigningMethodEnumType,
} from '../../../../src/types/index.js'

await describe('OCPP 1.6 meter value types', async () => {
  await describe('OCPP16MeterValueFormat', async () => {
    await it('should have RAW enum value equal to "Raw"', () => {
      assert.strictEqual(OCPP16MeterValueFormat.RAW, 'Raw')
    })

    await it('should have SIGNED_DATA enum value equal to "SignedData"', () => {
      assert.strictEqual(OCPP16MeterValueFormat.SIGNED_DATA, 'SignedData')
    })
  })

  await describe('OCPP16SignedMeterValue', async () => {
    await it('should compile as an interface with correct field names', () => {
      const signedMeterValue: OCPP16SignedMeterValue = {
        encodingMethod: EncodingMethodEnumType.OCMF,
        publicKey: 'b2NhOmJhc2UxNjphc24xOmZha2VrZXk=', // cspell:disable-line
        signedMeterData: 'T0NNRnx7fXxmYWtlc2lnbmF0dXJl', // cspell:disable-line
        signingMethod: SigningMethodEnumType.ECDSA_secp256r1_SHA256,
      }
      assert.strictEqual(signedMeterValue.encodingMethod, EncodingMethodEnumType.OCMF)
      assert.strictEqual(
        signedMeterValue.signingMethod,
        SigningMethodEnumType.ECDSA_secp256r1_SHA256
      )
      assert.ok(signedMeterValue.publicKey.length > 0)
      assert.ok(signedMeterValue.signedMeterData.length > 0)
    })
  })
})
