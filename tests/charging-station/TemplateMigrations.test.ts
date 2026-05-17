/**
 * @file Tests for TemplateMigrations
 * @description Unit tests for schema version coercion and migration functions
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  applyMigration,
  coerceVersion,
  CURRENT_SCHEMA_VERSION,
} from '../../src/charging-station/TemplateMigrations.js'
import { logger } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('TemplateMigrations', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('CURRENT_SCHEMA_VERSION', async () => {
    await it('should be a positive integer', () => {
      assert.ok(Number.isInteger(CURRENT_SCHEMA_VERSION))
      assert.strictEqual(CURRENT_SCHEMA_VERSION, 1)
    })
  })

  await describe('coerceVersion', async () => {
    await it('should return 0 for null or undefined (legacy templates trigger v0 migration)', () => {
      assert.strictEqual(coerceVersion(null), 0)
      assert.strictEqual(coerceVersion(undefined), 0)
    })

    await it('should return the number for valid integer', () => {
      assert.strictEqual(coerceVersion(1), 1)
      assert.strictEqual(coerceVersion(0), 0)
    })

    await it('should parse string to number', () => {
      assert.strictEqual(coerceVersion('1'), 1)
      assert.strictEqual(coerceVersion('0'), 0)
    })

    await it('should throw for non-numeric string', () => {
      assert.throws(() => coerceVersion('abc'), { message: /Invalid \$schemaVersion value/ })
    })

    await it('should throw for negative value', () => {
      assert.throws(() => coerceVersion(-1), { message: /must be a non-negative integer/ })
    })

    await it('should throw for float value', () => {
      assert.throws(() => coerceVersion(1.5), { message: /must be a non-negative integer/ })
    })

    await it('should throw for future version', () => {
      assert.throws(() => coerceVersion(CURRENT_SCHEMA_VERSION + 1), {
        message: /is newer than supported version/,
      })
    })

    await it('should throw for object value', () => {
      assert.throws(() => coerceVersion({}), { message: /Invalid \$schemaVersion value/ })
    })

    await it('should throw for boolean value', () => {
      assert.throws(() => coerceVersion(true), { message: /Invalid \$schemaVersion value/ })
    })
  })

  await describe('applyMigration', async () => {
    await it('should migrate v0 to v1 renaming deprecated keys', t => {
      // Arrange
      t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
      const template: Record<string, unknown> = {
        baseName: 'CS-TEST',
        chargePointModel: 'Test',
        chargePointVendor: 'Test',
        mustAuthorizeAtRemoteStart: true,
        supervisionUrl: 'ws://localhost:8080',
      }

      // Act
      const result = applyMigration(0, template)

      // Assert
      assert.strictEqual(result.$schemaVersion, CURRENT_SCHEMA_VERSION)
      assert.strictEqual(result.supervisionUrls, 'ws://localhost:8080')
      assert.strictEqual(result.supervisionUrl, undefined)
      assert.strictEqual(result.remoteAuthorization, true)
      assert.strictEqual(result.mustAuthorizeAtRemoteStart, undefined)
    })

    await it('should migrate v0 renaming authorizationFile to idTagsFile', t => {
      // Arrange
      t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
      const template: Record<string, unknown> = {
        authorizationFile: 'tags.json',
        baseName: 'CS-TEST',
      }

      // Act
      const result = applyMigration(0, template)

      // Assert
      assert.strictEqual(result.idTagsFile, 'tags.json')
      assert.strictEqual(result.authorizationFile, undefined)
    })

    await it('should migrate v0 renaming payloadSchemaValidation to ocppStrictCompliance', t => {
      // Arrange
      t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
      const template: Record<string, unknown> = {
        baseName: 'CS-TEST',
        payloadSchemaValidation: false,
      }

      // Act
      const result = applyMigration(0, template)

      // Assert
      assert.strictEqual(result.ocppStrictCompliance, false)
      assert.strictEqual(result.payloadSchemaValidation, undefined)
    })

    await it('should throw for unknown source version', () => {
      assert.throws(() => applyMigration(99, { baseName: 'CS-TEST' }), {
        message: /No migration defined/,
      })
    })

    await it('should set $schemaVersion to CURRENT_SCHEMA_VERSION after migration', t => {
      t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
      const template: Record<string, unknown> = { baseName: 'CS-TEST' }

      const result = applyMigration(0, template)

      assert.strictEqual(result.$schemaVersion, CURRENT_SCHEMA_VERSION)
    })
  })
})
