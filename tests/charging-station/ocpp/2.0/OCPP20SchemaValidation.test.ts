/**
 * @file Tests for OCPP 2.0 JSON schema validation (negative tests)
 * @description Verifies that OCPP 2.0.1 JSON schemas correctly reject invalid payloads
 * when compiled with AJV. Tests the schemas directly (not through service plumbing),
 * which ensures correctness regardless of path resolution in tsx/dist modes.
 *
 * This approach also validates the AJV configuration (strict:false required because
 * many OCPP 2.0 schemas use additionalItems without array items, which AJV 8 strict
 * mode rejects at compile time).
 */

import { expect } from '@std/expect'
import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const AjvConstructor = _Ajv.default
const ajvFormats = _ajvFormats.default

/** Absolute path to OCPP 2.0 JSON schemas, resolved relative to this test file. */
const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../src/assets/json-schemas/ocpp/2.0'
)

/**
 * Load a schema from the OCPP 2.0 schema directory and return parsed JSON.
 * @param filename - Schema filename (e.g. 'ResetRequest.json')
 * @returns Parsed JSON schema object
 */
function loadSchema (filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, filename), 'utf8')) as Record<string, unknown>
}

/**
 * Create an AJV validator for the given schema file.
 * strict:false is required because OCPP 2.0 schemas use additionalItems without
 * array items (a draft-07 pattern), which AJV 8 strict mode rejects at compile time.
 * @param schemaFile - Schema filename (e.g. 'ResetRequest.json')
 * @returns Compiled AJV validate function
 */
function makeValidator (schemaFile: string): ValidateFunction {
  const ajv = new AjvConstructor({ keywords: ['javaType'], multipleOfPrecision: 2, strict: false })
  ajvFormats(ajv)
  return ajv.compile(loadSchema(schemaFile))
}

await describe('OCPP 2.0 schema validation — negative tests', async () => {
  await it('AJV compiles ResetRequest schema without error (strict:false required)', () => {
    // Verifies the AJV configuration works for schemas using additionalItems pattern
    expect(() => makeValidator('ResetRequest.json')).not.toThrow()
  })

  await it('AJV compiles GetVariablesRequest schema without error (uses additionalItems)', () => {
    // GetVariablesRequest uses additionalItems:false — would fail in strict mode
    expect(() => makeValidator('GetVariablesRequest.json')).not.toThrow()
  })

  await it('Reset: missing required "type" field → validation fails', () => {
    const validate = makeValidator('ResetRequest.json')
    expect(validate({})).toBe(false)
    expect(validate.errors).toBeDefined()
    // AJV reports missingProperty for required field violations
    const hasMissingType = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'type'
    )
    expect(hasMissingType).toBe(true)
  })

  await it('Reset: invalid "type" enum value → validation fails', () => {
    const validate = makeValidator('ResetRequest.json')
    // Valid values are Immediate and OnIdle only; HardReset is OCPP 1.6
    expect(validate({ type: 'HardReset' })).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasEnumError = validate.errors?.some(e => e.keyword === 'enum')
    expect(hasEnumError).toBe(true)
  })

  await it('GetVariables: empty getVariableData array (minItems:1) → validation fails', () => {
    const validate = makeValidator('GetVariablesRequest.json')
    expect(validate({ getVariableData: [] })).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMinItemsError = validate.errors?.some(e => e.keyword === 'minItems')
    expect(hasMinItemsError).toBe(true)
  })

  await it('GetVariables: missing required getVariableData → validation fails', () => {
    const validate = makeValidator('GetVariablesRequest.json')
    expect(validate({})).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'getVariableData'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('SetVariables: missing required setVariableData → validation fails', () => {
    const validate = makeValidator('SetVariablesRequest.json')
    expect(validate({})).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'setVariableData'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('TriggerMessage: invalid requestedMessage enum value → validation fails', () => {
    const validate = makeValidator('TriggerMessageRequest.json')
    expect(validate({ requestedMessage: 'INVALID_MESSAGE_TYPE_XYZ' })).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasEnumError = validate.errors?.some(e => e.keyword === 'enum')
    expect(hasEnumError).toBe(true)
  })

  await it('TriggerMessage: missing required requestedMessage → validation fails', () => {
    const validate = makeValidator('TriggerMessageRequest.json')
    expect(validate({})).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'requestedMessage'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('UnlockConnector: missing required "evseId" → validation fails', () => {
    const validate = makeValidator('UnlockConnectorRequest.json')
    expect(validate({ connectorId: 1 })).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'evseId'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('UnlockConnector: missing required "connectorId" → validation fails', () => {
    const validate = makeValidator('UnlockConnectorRequest.json')
    expect(validate({ evseId: 1 })).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'connectorId'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('RequestStartTransaction: missing required "idToken" → validation fails', () => {
    const validate = makeValidator('RequestStartTransactionRequest.json')
    // remoteStartId is also required; provide it but omit idToken
    expect(validate({ remoteStartId: 1 })).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'idToken'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('CertificateSigned: missing required certificateChain → validation fails', () => {
    const validate = makeValidator('CertificateSignedRequest.json')
    expect(validate({})).toBe(false)
    expect(validate.errors).toBeDefined()
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'certificateChain'
    )
    expect(hasMissingProp).toBe(true)
  })

  await it('Reset: valid payload passes validation', () => {
    const validate = makeValidator('ResetRequest.json')
    expect(validate({ type: 'Immediate' })).toBe(true)
    expect(validate({ type: 'OnIdle' })).toBe(true)
    expect(validate({ evseId: 1, type: 'OnIdle' })).toBe(true)
  })

  await it('TriggerMessage: valid payload passes validation', () => {
    const validate = makeValidator('TriggerMessageRequest.json')
    expect(validate({ requestedMessage: 'Heartbeat' })).toBe(true)
    expect(validate({ requestedMessage: 'BootNotification' })).toBe(true)
  })
})
