/**
 * @file Tests for ConfigurationMigrations
 * @description Unit tests for schema version coercion and migration functions
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  applyConfigurationMigration,
  coerceConfigurationVersion,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEPRECATED_KEY_REMAPPINGS,
} from '../../src/charging-station/ConfigurationMigrations.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { buildLegacyConfiguration } from './helpers/ConfigurationFixtures.js'

await describe('ConfigurationMigrations', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('CURRENT_CONFIGURATION_SCHEMA_VERSION', async () => {
    await it('should be a positive integer', () => {
      assert.ok(Number.isInteger(CURRENT_CONFIGURATION_SCHEMA_VERSION))
      assert.strictEqual(CURRENT_CONFIGURATION_SCHEMA_VERSION, 1)
    })
  })

  await describe('coerceConfigurationVersion', async () => {
    await it('should return 0 for null or undefined (legacy configs trigger v0 migration)', () => {
      assert.strictEqual(coerceConfigurationVersion(null), 0)
      assert.strictEqual(coerceConfigurationVersion(undefined), 0)
    })

    await it('should return the number for valid integer', () => {
      assert.strictEqual(coerceConfigurationVersion(1), 1)
      assert.strictEqual(coerceConfigurationVersion(0), 0)
    })

    await it('should parse string to number', () => {
      assert.strictEqual(coerceConfigurationVersion('1'), 1)
      assert.strictEqual(coerceConfigurationVersion('0'), 0)
    })

    await it('should throw for non-numeric string', () => {
      assert.throws(() => coerceConfigurationVersion('abc'), {
        message: /must be a non-negative integer/,
      })
    })

    await it('should throw for negative value', () => {
      assert.throws(() => coerceConfigurationVersion(-1), {
        message: /must be a non-negative integer/,
      })
    })

    await it('should throw for float value', () => {
      assert.throws(() => coerceConfigurationVersion(1.5), {
        message: /must be a non-negative integer/,
      })
    })

    await it('should reject permissive numeric string forms', () => {
      for (const bad of ['1.0', '0x1', ' 1 ', '1e0', '', '01a', '+1', '-1']) {
        assert.throws(
          () => coerceConfigurationVersion(bad),
          { message: /must be a non-negative integer/ },
          `should reject ${JSON.stringify(bad)}`
        )
      }
    })

    await it('should use harmonized "non-negative integer" wording for all rejection branches', () => {
      for (const bad of ['abc', Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
        assert.throws(() => coerceConfigurationVersion(bad), {
          message: /must be a non-negative integer/,
        })
      }
    })

    await it('should throw for future version', () => {
      assert.throws(() => coerceConfigurationVersion(CURRENT_CONFIGURATION_SCHEMA_VERSION + 1), {
        message: /is newer than supported version/,
      })
    })

    await it('should throw for object value', () => {
      assert.throws(() => coerceConfigurationVersion({}), {
        message: /Invalid \$schemaVersion value/,
      })
    })

    await it('should throw for boolean value', () => {
      assert.throws(() => coerceConfigurationVersion(true), {
        message: /Invalid \$schemaVersion value/,
      })
    })
  })

  await describe('applyConfigurationMigration', async () => {
    await it('should migrate v0 to v1 remapping all deprecated top-level keys', () => {
      const legacy = buildLegacyConfiguration({
        logEnabled: true,
        logFile: '/logs/combined.log',
        stationTemplateURLs: [{ file: 'a.json', numberOfStations: 1 }],
        supervisionURLs: 'ws://localhost:8080',
        workerProcess: 'workerSet',
      })

      const result = applyConfigurationMigration(0, legacy, 'test.json')

      assert.strictEqual(result.$schemaVersion, CURRENT_CONFIGURATION_SCHEMA_VERSION)
      assert.strictEqual((result.log as Record<string, unknown>).enabled, true)
      assert.strictEqual((result.log as Record<string, unknown>).file, '/logs/combined.log')
      assert.strictEqual((result.worker as Record<string, unknown>).processType, 'workerSet')
      assert.strictEqual(result.supervisionUrls, 'ws://localhost:8080')
      assert.ok(Array.isArray(result.stationTemplateUrls))
      assert.strictEqual(result.logEnabled, undefined)
      assert.strictEqual(result.logFile, undefined)
      assert.strictEqual(result.workerProcess, undefined)
      assert.strictEqual(result.supervisionURLs, undefined)
      assert.strictEqual(result.stationTemplateURLs, undefined)
    })

    for (const [deprecated, canonical] of Object.entries(DEPRECATED_KEY_REMAPPINGS)) {
      await it(`should migrate deprecated key '${deprecated}' to '${canonical}'`, () => {
        const input = buildLegacyConfiguration({ [deprecated]: 'test-value' })
        const result = applyConfigurationMigration(0, input, 'test.json')

        assert.strictEqual(result[deprecated], undefined, `'${deprecated}' should be deleted`)
        if (deprecated === canonical) {
          // Self-mapping: key is deprecated with no replacement at top level; it is simply removed.
        } else if (!canonical.includes('.')) {
          assert.strictEqual(result[canonical], 'test-value', `'${canonical}' should be set`)
        } else {
          const [section, key] = canonical.split('.')
          const sectionObj = result[section] as Record<string, unknown> | undefined
          assert.ok(sectionObj != null, `section '${section}' should exist`)
          assert.strictEqual(sectionObj[key], 'test-value', `'${canonical}' should be set`)
        }
      })
    }

    await it('should not overwrite canonical key when both deprecated and canonical are present', () => {
      const input = buildLegacyConfiguration({
        log: { enabled: false },
        logEnabled: true,
      })
      const result = applyConfigurationMigration(0, input, 'test.json')

      assert.strictEqual((result.log as Record<string, unknown>).enabled, false)
      assert.strictEqual(result.logEnabled, undefined)
    })

    await it('should set $schemaVersion to CURRENT_CONFIGURATION_SCHEMA_VERSION after migration', () => {
      const result = applyConfigurationMigration(0, buildLegacyConfiguration(), 'test.json')
      assert.strictEqual(result.$schemaVersion, CURRENT_CONFIGURATION_SCHEMA_VERSION)
    })

    for (const [label, sourceVersion] of [
      ['unknown source version', 99],
      ['source version equal to CURRENT (no-op boundary)', CURRENT_CONFIGURATION_SCHEMA_VERSION],
      ['negative source version', -1],
    ] as const) {
      await it(`should throw for ${label}`, () => {
        assert.throws(
          () => applyConfigurationMigration(sourceVersion, buildLegacyConfiguration(), 'test.json'),
          {
            message: /No migration defined/,
          }
        )
      })
    }

    await it('should not mutate the input config (immutability boundary)', () => {
      const input = buildLegacyConfiguration({ logEnabled: true })
      const before = JSON.stringify(input)
      applyConfigurationMigration(0, input, 'test.json')
      const after = JSON.stringify(input)
      assert.strictEqual(before, after)
    })
  })
})
