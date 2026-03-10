/**
 * @file Tests for OCPP 1.6 JSON schema validation
 * @module OCPP 1.6 — §4.1 BootNotification, §5.11 RemoteStartTransaction, §9.3 SetChargingProfile,
 *   §5.13 Reset, §5.3 ChangeAvailability (representative schema coverage)
 * @description Verifies that OCPP 1.6 JSON schemas correctly validate and reject payloads
 * when compiled with AJV. Tests representative command pairs (request + response schemas).
 */

import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

const AjvConstructor = _Ajv.default
const ajvFormats = _ajvFormats.default

/** Absolute path to OCPP 1.6 JSON schemas, resolved relative to this test file. */
const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../src/assets/json-schemas/ocpp/1.6'
)

/**
 * Load a schema from the OCPP 1.6 schema directory and return parsed JSON.
 * @param filename - Schema filename (e.g. 'BootNotification.json')
 * @returns Parsed JSON schema object
 */
function loadSchema (filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, filename), 'utf8')) as Record<string, unknown>
}

/**
 * Create an AJV validator for the given schema file.
 * @param schemaFile - Schema filename (e.g. 'BootNotification.json')
 * @returns Compiled AJV validate function
 */
function makeValidator (schemaFile: string): ValidateFunction {
  const ajv = new AjvConstructor({ keywords: ['javaType'], multipleOfPrecision: 2, strict: false })
  ajvFormats(ajv)
  return ajv.compile(loadSchema(schemaFile))
}

await describe('OCPP16SchemaValidation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('BootNotification schema validation', async () => {
    await it('should compile BootNotification request schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('BootNotification.json')
      })
    })

    await it('should compile BootNotificationResponse schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('BootNotificationResponse.json')
      })
    })

    await it('should fail validation when BootNotification is missing required chargePointModel', () => {
      const validate = makeValidator('BootNotification.json')
      assert.strictEqual(validate({ chargePointVendor: 'TestVendor' }), false)
      assert.notStrictEqual(validate.errors, undefined)
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'chargePointModel'
      )
      assert.strictEqual(hasMissingProp, true)
    })

    await it('should pass validation when BootNotification has required fields', () => {
      const validate = makeValidator('BootNotification.json')
      const valid = validate({
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
      })
      assert.strictEqual(valid, true)
    })

    await it('should pass validation when BootNotificationResponse has valid status', () => {
      const validate = makeValidator('BootNotificationResponse.json')
      const valid = validate({
        currentTime: '2025-03-10T12:00:00Z',
        interval: 60,
        status: 'Accepted',
      })
      assert.strictEqual(valid, true)
    })
  })

  await describe('Authorize schema validation', async () => {
    await it('should compile Authorize request schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('Authorize.json')
      })
    })

    await it('should compile AuthorizeResponse schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('AuthorizeResponse.json')
      })
    })

    await it('should fail validation when Authorize is missing required idTag', () => {
      const validate = makeValidator('Authorize.json')
      assert.strictEqual(validate({}), false)
      assert.notStrictEqual(validate.errors, undefined)
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'idTag'
      )
      assert.strictEqual(hasMissingProp, true)
    })

    await it('should pass validation when Authorize has valid idTag', () => {
      const validate = makeValidator('Authorize.json')
      const valid = validate({ idTag: 'TEST-TAG-001' })
      assert.strictEqual(valid, true)
    })

    await it('should pass validation when AuthorizeResponse has valid status', () => {
      const validate = makeValidator('AuthorizeResponse.json')
      const valid = validate({ idTagInfo: { status: 'Accepted' } })
      assert.strictEqual(valid, true)
    })
  })

  await describe('StartTransaction schema validation', async () => {
    await it('should compile StartTransaction request schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('StartTransaction.json')
      })
    })

    await it('should compile StartTransactionResponse schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('StartTransactionResponse.json')
      })
    })

    await it('should fail validation when StartTransaction is missing required connectorId', () => {
      const validate = makeValidator('StartTransaction.json')
      assert.strictEqual(validate({ idTag: 'TEST-TAG', timestamp: '2025-03-10T12:00:00Z' }), false)
      assert.notStrictEqual(validate.errors, undefined)
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'connectorId'
      )
      assert.strictEqual(hasMissingProp, true)
    })

    await it('should pass validation when StartTransaction has all required fields', () => {
      const validate = makeValidator('StartTransaction.json')
      const valid = validate({
        connectorId: 1,
        idTag: 'TEST-TAG-001',
        meterStart: 0,
        timestamp: '2025-03-10T12:00:00Z',
      })
      assert.strictEqual(valid, true)
    })

    await it('should pass validation when StartTransactionResponse has valid transactionId', () => {
      const validate = makeValidator('StartTransactionResponse.json')
      const valid = validate({
        idTagInfo: { status: 'Accepted' },
        transactionId: 123,
      })
      assert.strictEqual(valid, true)
    })
  })

  await describe('Reset schema validation', async () => {
    await it('should compile Reset request schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('Reset.json')
      })
    })

    await it('should compile ResetResponse schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('ResetResponse.json')
      })
    })

    await it('should fail validation when Reset is missing required type', () => {
      const validate = makeValidator('Reset.json')
      assert.strictEqual(validate({}), false)
      assert.notStrictEqual(validate.errors, undefined)
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'type'
      )
      assert.strictEqual(hasMissingProp, true)
    })

    await it('should fail validation when Reset has invalid type enum value', () => {
      const validate = makeValidator('Reset.json')
      assert.strictEqual(validate({ type: 'InvalidType' }), false)
      assert.notStrictEqual(validate.errors, undefined)
      const hasEnumError = validate.errors?.some(e => e.keyword === 'enum')
      assert.strictEqual(hasEnumError, true)
    })

    await it('should pass validation when Reset has valid type', () => {
      const validate = makeValidator('Reset.json')
      const valid = validate({ type: 'Hard' })
      assert.strictEqual(valid, true)
    })

    await it('should pass validation when ResetResponse has valid status', () => {
      const validate = makeValidator('ResetResponse.json')
      const valid = validate({ status: 'Accepted' })
      assert.strictEqual(valid, true)
    })
  })

  await describe('SetChargingProfile schema validation', async () => {
    await it('should compile SetChargingProfile request schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('SetChargingProfile.json')
      })
    })

    await it('should compile SetChargingProfileResponse schema without error', () => {
      assert.doesNotThrow(() => {
        makeValidator('SetChargingProfileResponse.json')
      })
    })

    await it('should fail validation when SetChargingProfile is missing required connectorId', () => {
      const validate = makeValidator('SetChargingProfile.json')
      assert.strictEqual(validate({ csChargingProfiles: {} }), false)
      assert.notStrictEqual(validate.errors, undefined)
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'connectorId'
      )
      assert.strictEqual(hasMissingProp, true)
    })

    await it('should pass validation when SetChargingProfile has valid structure', () => {
      const validate = makeValidator('SetChargingProfile.json')
      const valid = validate({
        connectorId: 1,
        csChargingProfiles: {
          chargingProfileId: 1,
          chargingProfileKind: 'Absolute',
          chargingProfilePurpose: 'ChargePointMaxProfile',
          chargingSchedule: {
            chargingRateUnit: 'A',
            chargingSchedulePeriod: [{ limit: 32, startPeriod: 0 }],
          },
          stackLevel: 0,
        },
      })
      assert.strictEqual(valid, true)
    })

    await it('should pass validation when SetChargingProfileResponse has valid status', () => {
      const validate = makeValidator('SetChargingProfileResponse.json')
      const valid = validate({ status: 'Accepted' })
      assert.strictEqual(valid, true)
    })
  })
})
