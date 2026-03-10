/**
 * @file Tests for OCPP 1.6 JSON schema validation
 * @description Verifies that OCPP 1.6 JSON schemas correctly validate and reject payloads
 * when compiled with AJV. Tests representative command pairs (request + response schemas).
 */

import { expect } from '@std/expect'
import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
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
      expect(() => makeValidator('BootNotification.json')).not.toThrow()
    })

    await it('should compile BootNotificationResponse schema without error', () => {
      expect(() => makeValidator('BootNotificationResponse.json')).not.toThrow()
    })

    await it('should fail validation when BootNotification is missing required chargePointModel', () => {
      const validate = makeValidator('BootNotification.json')
      expect(validate({ chargePointVendor: 'TestVendor' })).toBe(false)
      expect(validate.errors).toBeDefined()
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'chargePointModel'
      )
      expect(hasMissingProp).toBe(true)
    })

    await it('should pass validation when BootNotification has required fields', () => {
      const validate = makeValidator('BootNotification.json')
      const valid = validate({
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
      })
      expect(valid).toBe(true)
    })

    await it('should pass validation when BootNotificationResponse has valid status', () => {
      const validate = makeValidator('BootNotificationResponse.json')
      const valid = validate({
        currentTime: '2025-03-10T12:00:00Z',
        interval: 60,
        status: 'Accepted',
      })
      expect(valid).toBe(true)
    })
  })

  await describe('Authorize schema validation', async () => {
    await it('should compile Authorize request schema without error', () => {
      expect(() => makeValidator('Authorize.json')).not.toThrow()
    })

    await it('should compile AuthorizeResponse schema without error', () => {
      expect(() => makeValidator('AuthorizeResponse.json')).not.toThrow()
    })

    await it('should fail validation when Authorize is missing required idTag', () => {
      const validate = makeValidator('Authorize.json')
      expect(validate({})).toBe(false)
      expect(validate.errors).toBeDefined()
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'idTag'
      )
      expect(hasMissingProp).toBe(true)
    })

    await it('should pass validation when Authorize has valid idTag', () => {
      const validate = makeValidator('Authorize.json')
      const valid = validate({ idTag: 'TEST-TAG-001' })
      expect(valid).toBe(true)
    })

    await it('should pass validation when AuthorizeResponse has valid status', () => {
      const validate = makeValidator('AuthorizeResponse.json')
      const valid = validate({ idTagInfo: { status: 'Accepted' } })
      expect(valid).toBe(true)
    })
  })

  await describe('StartTransaction schema validation', async () => {
    await it('should compile StartTransaction request schema without error', () => {
      expect(() => makeValidator('StartTransaction.json')).not.toThrow()
    })

    await it('should compile StartTransactionResponse schema without error', () => {
      expect(() => makeValidator('StartTransactionResponse.json')).not.toThrow()
    })

    await it('should fail validation when StartTransaction is missing required connectorId', () => {
      const validate = makeValidator('StartTransaction.json')
      expect(validate({ idTag: 'TEST-TAG', timestamp: '2025-03-10T12:00:00Z' })).toBe(false)
      expect(validate.errors).toBeDefined()
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'connectorId'
      )
      expect(hasMissingProp).toBe(true)
    })

    await it('should pass validation when StartTransaction has all required fields', () => {
      const validate = makeValidator('StartTransaction.json')
      const valid = validate({
        connectorId: 1,
        idTag: 'TEST-TAG-001',
        meterStart: 0,
        timestamp: '2025-03-10T12:00:00Z',
      })
      expect(valid).toBe(true)
    })

    await it('should pass validation when StartTransactionResponse has valid transactionId', () => {
      const validate = makeValidator('StartTransactionResponse.json')
      const valid = validate({
        idTagInfo: { status: 'Accepted' },
        transactionId: 123,
      })
      expect(valid).toBe(true)
    })
  })

  await describe('Reset schema validation', async () => {
    await it('should compile Reset request schema without error', () => {
      expect(() => makeValidator('Reset.json')).not.toThrow()
    })

    await it('should compile ResetResponse schema without error', () => {
      expect(() => makeValidator('ResetResponse.json')).not.toThrow()
    })

    await it('should fail validation when Reset is missing required type', () => {
      const validate = makeValidator('Reset.json')
      expect(validate({})).toBe(false)
      expect(validate.errors).toBeDefined()
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'type'
      )
      expect(hasMissingProp).toBe(true)
    })

    await it('should fail validation when Reset has invalid type enum value', () => {
      const validate = makeValidator('Reset.json')
      expect(validate({ type: 'InvalidType' })).toBe(false)
      expect(validate.errors).toBeDefined()
      const hasEnumError = validate.errors?.some(e => e.keyword === 'enum')
      expect(hasEnumError).toBe(true)
    })

    await it('should pass validation when Reset has valid type', () => {
      const validate = makeValidator('Reset.json')
      const valid = validate({ type: 'Hard' })
      expect(valid).toBe(true)
    })

    await it('should pass validation when ResetResponse has valid status', () => {
      const validate = makeValidator('ResetResponse.json')
      const valid = validate({ status: 'Accepted' })
      expect(valid).toBe(true)
    })
  })

  await describe('SetChargingProfile schema validation', async () => {
    await it('should compile SetChargingProfile request schema without error', () => {
      expect(() => makeValidator('SetChargingProfile.json')).not.toThrow()
    })

    await it('should compile SetChargingProfileResponse schema without error', () => {
      expect(() => makeValidator('SetChargingProfileResponse.json')).not.toThrow()
    })

    await it('should fail validation when SetChargingProfile is missing required connectorId', () => {
      const validate = makeValidator('SetChargingProfile.json')
      expect(validate({ csChargingProfiles: {} })).toBe(false)
      expect(validate.errors).toBeDefined()
      const hasMissingProp = validate.errors?.some(
        e =>
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string }).missingProperty === 'connectorId'
      )
      expect(hasMissingProp).toBe(true)
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
      expect(valid).toBe(true)
    })

    await it('should pass validation when SetChargingProfileResponse has valid status', () => {
      const validate = makeValidator('SetChargingProfileResponse.json')
      const valid = validate({ status: 'Accepted' })
      expect(valid).toBe(true)
    })
  })
})
