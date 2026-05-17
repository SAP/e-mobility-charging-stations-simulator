/**
 * @file Tests for TemplateValidation
 * @description Unit tests for template validation pipeline, transforms, and error handling
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ZodError } from 'zod'

import { CURRENT_SCHEMA_VERSION } from '../../src/charging-station/TemplateMigrations.js'
import {
  TemplateValidationError,
  validateTemplate,
} from '../../src/charging-station/TemplateValidation.js'
import { BaseError } from '../../src/exception/index.js'
import { logger } from '../../src/utils/index.js'
import { mockLoggerWarnDebug, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './ChargingStationTestConstants.js'
import { buildLegacyTemplate, buildMinimalTemplate } from './helpers/TemplateFixtures.js'

await describe('TemplateValidation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('validateTemplate', async () => {
    await it('should validate a minimal valid template', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({ Connectors: { 0: {}, 1: {} } })

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.baseName, TEST_CHARGING_STATION_BASE_NAME)
    })

    await it('should accept string "$schemaVersion": "1" at current version (no-migration path)', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({
        $schemaVersion: '1',
        Connectors: { 0: {}, 1: {} },
      })

      const result = validateTemplate(parsed, 'string-version.json')

      assert.strictEqual(result.baseName, TEST_CHARGING_STATION_BASE_NAME)
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_SCHEMA_VERSION,
        '$schemaVersion should be normalized to numeric CURRENT_SCHEMA_VERSION'
      )
    })

    await it('should not mutate the caller-supplied parsed object (immutability boundary)', t => {
      mockLoggerWarnDebug(t, logger)
      const parsed = buildLegacyTemplate({
        Connectors: { 0: {}, 1: {} },
        supervisionUrl: 'ws://localhost:8080',
      })
      const before = structuredClone(parsed)

      validateTemplate(parsed, 'immutable.json')

      assert.deepStrictEqual(parsed, before)
    })

    await it('should throw BaseError for empty template', () => {
      assert.throws(
        () => validateTemplate({}, 'test.json'),
        (error: unknown) =>
          error instanceof BaseError &&
          error.message.includes('Empty charging station information from template file')
      )
    })

    await it('should throw TemplateValidationError for invalid template', () => {
      assert.throws(
        () => validateTemplate({ baseName: '' }, 'test.json'),
        (error: unknown) => error instanceof TemplateValidationError
      )
    })

    await it('should include filePath and fieldErrors in TemplateValidationError', () => {
      try {
        validateTemplate(
          { baseName: '', chargePointModel: 'X', chargePointVendor: 'Y' },
          'my-template.json'
        )
        assert.fail('Expected TemplateValidationError')
      } catch (error) {
        assert.ok(error instanceof TemplateValidationError)
        assert.strictEqual(error.filePath, 'my-template.json')
        assert.ok(Array.isArray(error.fieldErrors))
        assert.ok(error.fieldErrors.length > 0)
      }
    })

    await it('should apply migration for v0 templates', t => {
      mockLoggerWarnDebug(t, logger)
      const parsed = buildLegacyTemplate({
        $schemaVersion: 0,
        Connectors: { 0: {}, 1: {} },
        supervisionUrl: 'ws://localhost:8080',
      })

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.supervisionUrls, 'ws://localhost:8080')
    })

    await it('should auto-migrate template missing $schemaVersion (legacy v0 default)', t => {
      mockLoggerWarnDebug(t, logger)
      const parsed = buildLegacyTemplate({
        authorizationFile: 'tags.json',
        Connectors: { 0: {}, 1: {} },
        mustAuthorizeAtRemoteStart: true,
        payloadSchemaValidation: false,
        supervisionUrl: 'ws://localhost:8080',
      })

      const result = validateTemplate(parsed, 'legacy.json')

      assert.strictEqual(result.supervisionUrls, 'ws://localhost:8080')
      assert.strictEqual(result.idTagsFile, 'tags.json')
      assert.strictEqual(result.remoteAuthorization, true)
      assert.strictEqual(result.ocppStrictCompliance, false)
      const raw = result as unknown as Record<string, unknown>
      assert.strictEqual(raw.supervisionUrl, undefined)
      assert.strictEqual(raw.authorizationFile, undefined)
      assert.strictEqual(raw.mustAuthorizeAtRemoteStart, undefined)
      assert.strictEqual(raw.payloadSchemaValidation, undefined)
    })

    for (const [label, payload] of [
      ['null', null],
      ['string', 'a string'],
      ['array', [1, 2, 3]],
    ] as const) {
      await it(`should throw BaseError for ${label} parsed payload`, () => {
        assert.throws(
          () => validateTemplate(payload, `${label}.json`),
          (error: unknown) =>
            error instanceof BaseError &&
            error.message.includes('Invalid charging station template payload (not a JSON object)')
        )
      })
    }

    for (const [legacyKey, legacyValue] of [
      ['supervisionUrl', 'ws://localhost:8080'],
      ['mustAuthorizeAtRemoteStart', true],
      ['payloadSchemaValidation', false],
    ] as const) {
      await it(`should reject v1 template containing legacy ${legacyKey} key`, t => {
        t.mock.method(logger, 'warn')
        assert.throws(
          () =>
            validateTemplate(buildMinimalTemplate({ [legacyKey]: legacyValue }), 'v1-legacy.json'),
          (error: unknown) =>
            error instanceof TemplateValidationError &&
            error.fieldErrors.some(e => e.path === legacyKey && e.message.includes('Deprecated'))
        )
      })
    }

    await it('should include "(migrated from vX → vY)" note in TemplateValidationError message', t => {
      mockLoggerWarnDebug(t, logger)
      try {
        validateTemplate(buildLegacyTemplate({ $schemaVersion: 0, baseName: '' }), 'broken.json')
        assert.fail('Expected TemplateValidationError')
      } catch (error) {
        assert.ok(error instanceof TemplateValidationError)
        assert.strictEqual(error.migratedFrom, 0)
        assert.match(error.message, /migrated from v0 → v1/)
      }
    })
  })

  await describe('transformTemplate', async () => {
    await it('should warn about missing idTagsFile', t => {
      const warnMock = t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate()

      validateTemplate(parsed, 'test.json')

      const warnMessages = warnMock.mock.calls.map(c =>
        typeof c.arguments[0] === 'string' ? c.arguments[0] : ''
      )
      assert.ok(warnMessages.some(m => m.includes('Missing id tags file')))
    })

    await it('should force randomConnectors when scalar numberOfConnectors exceeds defined connectors', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({
        Connectors: { 0: {}, 1: {} },
        numberOfConnectors: 5,
        randomConnectors: false,
      })

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.randomConnectors, true)
    })

    await it('should force randomConnectors when max(numberOfConnectors[]) exceeds defined connectors', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({
        Connectors: { 0: {}, 1: {}, 2: {} },
        numberOfConnectors: [2, 4, 6],
        randomConnectors: false,
      })

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.randomConnectors, true)
    })

    await it('should not force randomConnectors when max(numberOfConnectors[]) does not exceed defined connectors', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({
        Connectors: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} },
        numberOfConnectors: [1, 2, 3, 4],
      })

      const result = validateTemplate(parsed, 'test.json')

      assert.notStrictEqual(result.randomConnectors, true)
    })

    await it('should not force randomConnectors when already true', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({
        Connectors: { 0: {}, 1: {} },
        numberOfConnectors: 5,
        randomConnectors: true,
      })

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.randomConnectors, true)
    })

    await it('should not log error for empty Connectors map', t => {
      const errorMock = t.mock.method(logger, 'error')
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalTemplate({ Connectors: {} })

      validateTemplate(parsed, 'test.json')

      const errorMessages = errorMock.mock.calls.map(c =>
        typeof c.arguments[0] === 'string' ? c.arguments[0] : ''
      )
      assert.ok(!errorMessages.some(m => m.includes('no connectors configuration defined')))
    })
  })

  await describe('TemplateValidationError', async () => {
    await it('should be an instance of BaseError', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Required',
          path: ['baseName'],
        },
      ])
      const error = new TemplateValidationError(zodError, { filePath: 'test.json' })
      assert.ok(error instanceof BaseError)
      assert.strictEqual(error.filePath, 'test.json')
      assert.strictEqual(error.fieldErrors.length, 1)
      assert.strictEqual(error.fieldErrors[0].path, 'baseName')
    })

    await it('should include migratedFrom when provided', () => {
      const zodError = new ZodError([])
      const error = new TemplateValidationError(zodError, {
        filePath: 'test.json',
        migratedFrom: 0,
      })
      assert.strictEqual(error.migratedFrom, 0)
    })
  })

  await describe('all template files round-trip', async () => {
    await it('should validate all 15 station template files through the pipeline', async t => {
      mockLoggerWarnDebug(t, logger)
      const fs = await import('node:fs')
      const path = await import('node:path')
      const templateDir = path.join(import.meta.dirname, '../../src/assets/station-templates')
      const files = fs.readdirSync(templateDir).filter(f => f.endsWith('.json'))
      assert.strictEqual(files.length, 15)

      for (const file of files) {
        const content = fs.readFileSync(path.join(templateDir, file), 'utf8')
        const parsed = JSON.parse(content) as Record<string, unknown>
        const result = validateTemplate(parsed, file)
        assert.ok(result, `Template ${file} should validate successfully`)
        assert.strictEqual(
          result.baseName.length > 0,
          true,
          `Template ${file} should have baseName`
        )
      }
    })
  })
})
