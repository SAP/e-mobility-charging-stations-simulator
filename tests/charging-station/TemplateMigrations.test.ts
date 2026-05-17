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
import { mockLoggerWarnDebug, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { buildLegacyTemplate } from './helpers/TemplateFixtures.js'

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
      assert.throws(() => coerceVersion('abc'), { message: /must be a non-negative integer/ })
    })

    await it('should throw for negative value', () => {
      assert.throws(() => coerceVersion(-1), { message: /must be a non-negative integer/ })
    })

    await it('should throw for float value', () => {
      assert.throws(() => coerceVersion(1.5), { message: /must be a non-negative integer/ })
    })

    await it('should reject permissive numeric string forms', () => {
      for (const bad of ['1.0', '0x1', ' 1 ', '1e0', '', '01a', '+1', '-1']) {
        assert.throws(
          () => coerceVersion(bad),
          { message: /must be a non-negative integer/ },
          `should reject ${JSON.stringify(bad)}`
        )
      }
    })

    await it('should use harmonized "non-negative integer" wording for all rejection branches', () => {
      for (const bad of ['abc', Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
        assert.throws(() => coerceVersion(bad), { message: /must be a non-negative integer/ })
      }
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
    await it('should migrate v0 to v1 renaming all deprecated keys at once', t => {
      mockLoggerWarnDebug(t, logger)
      const template = buildLegacyTemplate({
        authorizationFile: 'tags.json',
        mustAuthorizeAtRemoteStart: true,
        payloadSchemaValidation: false,
        supervisionUrl: 'ws://localhost:8080',
      })

      const result = applyMigration(0, template)

      assert.strictEqual(result.$schemaVersion, CURRENT_SCHEMA_VERSION)
      assert.strictEqual(result.supervisionUrls, 'ws://localhost:8080')
      assert.strictEqual(result.idTagsFile, 'tags.json')
      assert.strictEqual(result.remoteAuthorization, true)
      assert.strictEqual(result.ocppStrictCompliance, false)
      assert.strictEqual(result.supervisionUrl, undefined)
      assert.strictEqual(result.authorizationFile, undefined)
      assert.strictEqual(result.mustAuthorizeAtRemoteStart, undefined)
      assert.strictEqual(result.payloadSchemaValidation, undefined)
    })

    for (const [deprecated, replacement, value] of [
      ['supervisionUrl', 'supervisionUrls', 'ws://localhost:8080'],
      ['authorizationFile', 'idTagsFile', 'tags.json'],
      ['payloadSchemaValidation', 'ocppStrictCompliance', false],
      ['mustAuthorizeAtRemoteStart', 'remoteAuthorization', true],
    ] as const) {
      await it(`should migrate v0 renaming ${deprecated} to ${replacement}`, t => {
        mockLoggerWarnDebug(t, logger)
        const template = buildLegacyTemplate({ [deprecated]: value })

        const result = applyMigration(0, template)

        assert.strictEqual(result[replacement], value)
        assert.strictEqual(result[deprecated], undefined)
      })
    }

    for (const [label, sourceVersion] of [
      ['unknown source version', 99],
      ['source version equal to CURRENT_SCHEMA_VERSION (no-op boundary)', CURRENT_SCHEMA_VERSION],
      ['negative source version', -1],
    ] as const) {
      await it(`should throw for ${label}`, () => {
        assert.throws(() => applyMigration(sourceVersion, buildLegacyTemplate()), {
          message: /No migration defined/,
        })
      })
    }

    await it('should set $schemaVersion to CURRENT_SCHEMA_VERSION after migration', t => {
      mockLoggerWarnDebug(t, logger)

      const result = applyMigration(0, buildLegacyTemplate())

      assert.strictEqual(result.$schemaVersion, CURRENT_SCHEMA_VERSION)
    })
  })
})
