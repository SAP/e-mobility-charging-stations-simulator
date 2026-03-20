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

import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPP20IncomingRequestCommand, OCPP20RequestCommand } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

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
  afterEach(() => {
    standardCleanup()
  })

  await it('should compile ResetRequest schema without error (strict:false required)', () => {
    // Verifies the AJV configuration works for schemas using additionalItems pattern
    assert.doesNotThrow(() => {
      makeValidator('ResetRequest.json')
    })
  })

  await it('should compile GetVariablesRequest schema without error (uses additionalItems)', () => {
    // GetVariablesRequest uses additionalItems:false — would fail in strict mode
    assert.doesNotThrow(() => {
      makeValidator('GetVariablesRequest.json')
    })
  })

  await it('should fail validation when Reset payload is missing required "type" field', () => {
    const validate = makeValidator('ResetRequest.json')
    assert.strictEqual(validate({}), false)
    assert.notStrictEqual(validate.errors, undefined)
    // AJV reports missingProperty for required field violations
    const hasMissingType = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'type'
    )
    assert.strictEqual(hasMissingType, true)
  })

  await it('should fail validation when Reset payload has invalid "type" enum value', () => {
    const validate = makeValidator('ResetRequest.json')
    // Valid values are Immediate and OnIdle only; HardReset is OCPP 1.6
    assert.strictEqual(validate({ type: 'HardReset' }), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasEnumError = validate.errors?.some(e => e.keyword === 'enum')
    assert.strictEqual(hasEnumError, true)
  })

  await it('should fail validation when GetVariables has empty getVariableData array', () => {
    const validate = makeValidator('GetVariablesRequest.json')
    assert.strictEqual(validate({ getVariableData: [] }), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMinItemsError = validate.errors?.some(e => e.keyword === 'minItems')
    assert.strictEqual(hasMinItemsError, true)
  })

  await it('should fail validation when GetVariables is missing required getVariableData', () => {
    const validate = makeValidator('GetVariablesRequest.json')
    assert.strictEqual(validate({}), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'getVariableData'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should fail validation when SetVariables is missing required setVariableData', () => {
    const validate = makeValidator('SetVariablesRequest.json')
    assert.strictEqual(validate({}), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'setVariableData'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should fail validation when TriggerMessage has invalid requestedMessage enum value', () => {
    const validate = makeValidator('TriggerMessageRequest.json')
    assert.strictEqual(validate({ requestedMessage: 'INVALID_MESSAGE_TYPE_XYZ' }), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasEnumError = validate.errors?.some(e => e.keyword === 'enum')
    assert.strictEqual(hasEnumError, true)
  })

  await it('should fail validation when TriggerMessage is missing required requestedMessage', () => {
    const validate = makeValidator('TriggerMessageRequest.json')
    assert.strictEqual(validate({}), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'requestedMessage'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should fail validation when UnlockConnector is missing required evseId', () => {
    const validate = makeValidator('UnlockConnectorRequest.json')
    assert.strictEqual(validate({ connectorId: 1 }), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'evseId'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should fail validation when UnlockConnector is missing required connectorId', () => {
    const validate = makeValidator('UnlockConnectorRequest.json')
    assert.strictEqual(validate({ evseId: 1 }), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'connectorId'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should fail validation when RequestStartTransaction is missing required idToken', () => {
    const validate = makeValidator('RequestStartTransactionRequest.json')
    // remoteStartId is also required; provide it but omit idToken
    assert.strictEqual(validate({ remoteStartId: 1 }), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'idToken'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should fail validation when CertificateSigned is missing required certificateChain', () => {
    const validate = makeValidator('CertificateSignedRequest.json')
    assert.strictEqual(validate({}), false)
    assert.notStrictEqual(validate.errors, undefined)
    const hasMissingProp = validate.errors?.some(
      e =>
        e.keyword === 'required' &&
        (e.params as { missingProperty?: string }).missingProperty === 'certificateChain'
    )
    assert.strictEqual(hasMissingProp, true)
  })

  await it('should pass validation for valid Reset payloads', () => {
    const validate = makeValidator('ResetRequest.json')
    assert.strictEqual(validate({ type: 'Immediate' }), true)
    assert.strictEqual(validate({ type: 'OnIdle' }), true)
    assert.strictEqual(validate({ evseId: 1, type: 'OnIdle' }), true)
  })

  await it('should pass validation for valid TriggerMessage payloads', () => {
    const validate = makeValidator('TriggerMessageRequest.json')
    assert.strictEqual(validate({ requestedMessage: 'Heartbeat' }), true)
    assert.strictEqual(validate({ requestedMessage: 'BootNotification' }), true)
  })

  await describe('schema registration coverage', async () => {
    await it('should register an incoming request schema for every OCPP20IncomingRequestCommand', () => {
      const configs = OCPP20ServiceUtils.createIncomingRequestPayloadConfigs()
      const registered = new Set(configs.map(([cmd]) => cmd))
      for (const command of Object.values(OCPP20IncomingRequestCommand)) {
        assert.ok(registered.has(command), `missing incoming request schema for: ${command}`)
      }
    })

    await it('should register an incoming response schema for every OCPP20IncomingRequestCommand', () => {
      const configs = OCPP20ServiceUtils.createIncomingRequestResponsePayloadConfigs()
      const registered = new Set(configs.map(([cmd]) => cmd))
      for (const command of Object.values(OCPP20IncomingRequestCommand)) {
        assert.ok(registered.has(command), `missing incoming response schema for: ${command}`)
      }
    })

    await it('should register an outgoing request schema for every OCPP20RequestCommand', () => {
      const configs = OCPP20ServiceUtils.createRequestPayloadConfigs()
      const registered = new Set(configs.map(([cmd]) => cmd))
      for (const command of Object.values(OCPP20RequestCommand)) {
        assert.ok(registered.has(command), `missing outgoing request schema for: ${command}`)
      }
    })

    await it('should register an outgoing response schema for every OCPP20RequestCommand', () => {
      const configs = OCPP20ServiceUtils.createResponsePayloadConfigs()
      const registered = new Set(configs.map(([cmd]) => cmd))
      for (const command of Object.values(OCPP20RequestCommand)) {
        assert.ok(registered.has(command), `missing outgoing response schema for: ${command}`)
      }
    })

    await it('should reference existing schema files for all registered schemas', () => {
      const allConfigs = [
        ...OCPP20ServiceUtils.createIncomingRequestPayloadConfigs(),
        ...OCPP20ServiceUtils.createIncomingRequestResponsePayloadConfigs(),
        ...OCPP20ServiceUtils.createRequestPayloadConfigs(),
        ...OCPP20ServiceUtils.createResponsePayloadConfigs(),
      ]
      for (const [command, { schemaPath }] of allConfigs) {
        assert.ok(
          existsSync(join(SCHEMA_DIR, schemaPath)),
          `schema file missing for ${command}: ${schemaPath}`
        )
      }
    })

    await it('should register a response handler for every OCPP20RequestCommand', () => {
      const responseService = new OCPP20ResponseService()
      const handlers = (responseService as unknown as { responseHandlers: Map<string, unknown> })
        .responseHandlers
      const registered = new Set(handlers.keys())
      for (const command of Object.values(OCPP20RequestCommand)) {
        assert.ok(registered.has(command), `missing response handler for: ${command}`)
      }
    })

    await it('should register an incoming request handler for every OCPP20IncomingRequestCommand', () => {
      const incomingService = new OCPP20IncomingRequestService()
      const handlers = (
        incomingService as unknown as { incomingRequestHandlers: Map<string, unknown> }
      ).incomingRequestHandlers
      const registered = new Set(handlers.keys())
      for (const command of Object.values(OCPP20IncomingRequestCommand)) {
        assert.ok(registered.has(command), `missing incoming request handler for: ${command}`)
      }
    })
  })
})
