/**
 * @file Tests for TemplateValidation
 * @description Unit tests for template validation pipeline, transforms, and error handling
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ZodError } from 'zod'

import {
  TemplateValidationError,
  validateTemplate,
} from '../../src/charging-station/TemplateValidation.js'
import { BaseError } from '../../src/exception/index.js'
import { logger } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('TemplateValidation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('validateTemplate', async () => {
    await it('should validate a minimal valid template', t => {
      t.mock.method(logger, 'warn')
      const parsed: Record<string, unknown> = {
        $schemaVersion: 1,
        baseName: 'CS-TEST',
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
        Connectors: { 0: {}, 1: {} },
      }

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.baseName, 'CS-TEST')
      assert.strictEqual(result.chargePointModel, 'TestModel')
    })

    await it('should throw BaseError for empty template', () => {
      assert.throws(
        () => validateTemplate({}, 'test.json'),
        (error: unknown) =>
          error instanceof BaseError && error.message.includes('Empty charging station')
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
      t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
      const parsed: Record<string, unknown> = {
        $schemaVersion: 0,
        baseName: 'CS-TEST',
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
        Connectors: { 0: {}, 1: {} },
        supervisionUrl: 'ws://localhost:8080',
      }

      const result = validateTemplate(parsed, 'test.json')

      assert.strictEqual(result.supervisionUrls, 'ws://localhost:8080')
    })

    await it('should default $schemaVersion to 1 when missing', t => {
      t.mock.method(logger, 'warn')
      const parsed: Record<string, unknown> = {
        baseName: 'CS-TEST',
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
      }

      const result = validateTemplate(parsed, 'test.json')
      assert.ok(result)
    })
  })

  await describe('transformTemplate', async () => {
    await it('should warn about missing idTagsFile', t => {
      // Arrange
      const warnMock = t.mock.method(logger, 'warn')
      const parsed: Record<string, unknown> = {
        $schemaVersion: 1,
        baseName: 'CS-TEST',
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
      }

      // Act
      validateTemplate(parsed, 'test.json')

      // Assert
      const warnMessages = warnMock.mock.calls.map(c =>
        typeof c.arguments[0] === 'string' ? c.arguments[0] : ''
      )
      assert.ok(warnMessages.some(m => m.includes('Missing id tags file')))
    })

    await it('should force randomConnectors when connector count exceeds config', t => {
      // Arrange
      t.mock.method(logger, 'warn')
      const parsed: Record<string, unknown> = {
        $schemaVersion: 1,
        baseName: 'CS-TEST',
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
        Connectors: { 0: {}, 1: {} },
        numberOfConnectors: 5,
        randomConnectors: false,
      }

      // Act
      const result = validateTemplate(parsed, 'test.json')

      // Assert
      assert.strictEqual(result.randomConnectors, true)
    })

    await it('should not force randomConnectors when already true', t => {
      // Arrange
      t.mock.method(logger, 'warn')
      const parsed: Record<string, unknown> = {
        $schemaVersion: 1,
        baseName: 'CS-TEST',
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
        Connectors: { 0: {}, 1: {} },
        numberOfConnectors: 5,
        randomConnectors: true,
      }

      // Act
      const result = validateTemplate(parsed, 'test.json')

      // Assert
      assert.strictEqual(result.randomConnectors, true)
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
      t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
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
