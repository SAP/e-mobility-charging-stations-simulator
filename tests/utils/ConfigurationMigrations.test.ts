/**
 * @file Tests for ConfigurationMigrations
 * @description Unit tests for schema version coercion, the deprecated-key
 * sweep (`remapDeprecatedKeys`), and the version-bump migration chain
 * (`applyConfigurationMigration`).
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  applyConfigurationMigration,
  coerceConfigurationVersion,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEPRECATED_KEY_REMAPPINGS,
  remapDeprecatedKeys,
} from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  buildLegacyConfiguration,
  buildV0WithDeprecatedKeyCollision,
} from './helpers/ConfigurationFixtures.js'

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

  await describe('remapDeprecatedKeys', async () => {
    await it('should not mutate the input config (immutability boundary)', () => {
      const input = buildLegacyConfiguration({ logEnabled: true })
      const before = JSON.stringify(input)
      remapDeprecatedKeys(input)
      const after = JSON.stringify(input)
      assert.strictEqual(before, after)
    })

    await it('should be a no-op (empty warnings, empty fieldErrors) for a clean v1 config', () => {
      const result = remapDeprecatedKeys({
        $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION,
        stationTemplateUrls: [{ file: 'clean.json', numberOfStations: 1 }],
      })
      assert.deepStrictEqual(result.warnings, [])
      assert.deepStrictEqual(result.fieldErrors, [])
    })

    await it('should remap every legacy top-level key in buildLegacyConfiguration', () => {
      const legacy = buildLegacyConfiguration({
        logEnabled: true,
        logFile: '/logs/combined.log',
        stationTemplateURLs: [{ file: 'a.json', numberOfStations: 1 }],
        supervisionURLs: 'ws://localhost:8080',
        workerProcess: 'workerSet',
      })

      const { config: result, fieldErrors, warnings } = remapDeprecatedKeys(legacy)

      assert.strictEqual(fieldErrors.length, 0)
      assert.ok(warnings.length > 0)
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
      await it(`should remap deprecated key '${deprecated}' to ${canonical == null ? 'null (delete-only)' : `'${canonical}'`}`, () => {
        const sampleValue = deprecated.includes('worker') ? 'workerSet' : 'sample-value'
        // Build input with the deprecated key. Dotted keys nest into a section.
        const input: Record<string, unknown> = deprecated.includes('.')
          ? (() => {
              const [section, leaf] = deprecated.split('.')
              return { [section]: { [leaf]: sampleValue } }
            })()
          : { [deprecated]: sampleValue }

        const { config: result, fieldErrors, warnings } = remapDeprecatedKeys(input)

        assert.strictEqual(fieldErrors.length, 0)
        assert.deepStrictEqual(warnings, [
          { canonicalDestination: canonical, sourceKey: deprecated },
        ])

        // Source key must be physically removed from its location.
        if (deprecated.includes('.')) {
          const [section, leaf] = deprecated.split('.')
          const sectionObj = result[section] as Record<string, unknown> | undefined
          assert.strictEqual(
            sectionObj?.[leaf],
            undefined,
            `nested source '${deprecated}' must be removed`
          )
        } else {
          assert.strictEqual(
            Object.prototype.hasOwnProperty.call(result, deprecated),
            false,
            `top-level source '${deprecated}' must be removed`
          )
        }

        // Verify canonical destination semantics.
        if (canonical == null) {
          // Delete-only destination: value must not appear anywhere obvious.
          // Specifically, no top-level key carries the same name as `deprecated`.
          assert.strictEqual(result[deprecated], undefined)
        } else if (canonical === deprecated) {
          // Self-mapping: the key remains absent (table entry should normally
          // use `null` for this case; tolerated here for forward-compat).
          assert.strictEqual(result[deprecated], undefined)
        } else if (canonical.includes('.')) {
          const [section, leaf] = canonical.split('.')
          const sectionObj = result[section] as Record<string, unknown> | undefined
          assert.ok(sectionObj != null, `section '${section}' should exist`)
          assert.strictEqual(sectionObj[leaf], sampleValue)
        } else {
          assert.strictEqual(result[canonical], sampleValue)
        }
      })
    }

    await it('should keep canonical key when both deprecated and canonical are present (no overwrite)', () => {
      const input = {
        log: { enabled: false },
        logEnabled: false,
      }
      const { config: result, fieldErrors } = remapDeprecatedKeys(input)
      assert.strictEqual(fieldErrors.length, 0)
      assert.strictEqual((result.log as Record<string, unknown>).enabled, false)
      assert.strictEqual(result.logEnabled, undefined)
    })

    await it('should drop autoReconnectMaxRetries with explicit warning (null destination)', () => {
      const {
        config: result,
        fieldErrors,
        warnings,
      } = remapDeprecatedKeys({
        autoReconnectMaxRetries: 7,
        stationTemplateURLs: [{ file: 'b2.json', numberOfStations: 1 }],
      })
      assert.strictEqual(fieldErrors.length, 0)
      assert.deepStrictEqual(
        warnings.find(w => w.sourceKey === 'autoReconnectMaxRetries'),
        { canonicalDestination: null, sourceKey: 'autoReconnectMaxRetries' }
      )
      assert.strictEqual(result.autoReconnectMaxRetries, undefined)
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(result, 'autoReconnectMaxRetries'),
        false
      )
    })

    await it('should treat equal-value collision as idempotent no-op', () => {
      const input = buildV0WithDeprecatedKeyCollision('workerPoolMaxSize', 16, 'workerPoolSize', 16)
      const { config: result, fieldErrors, warnings } = remapDeprecatedKeys(input)
      assert.strictEqual(fieldErrors.length, 0, 'equal values must not produce a fieldError')
      assert.strictEqual((result.worker as Record<string, unknown>).poolMaxSize, 16)
      assert.strictEqual(result.workerPoolMaxSize, undefined)
      assert.strictEqual(result.workerPoolSize, undefined)
      assert.strictEqual(warnings.length, 2)
    })

    await it('should record fieldError on unequal-value collision and leave conflicting source in place', () => {
      const input = buildV0WithDeprecatedKeyCollision('workerPoolMaxSize', 8, 'workerPoolSize', 16)
      const { config: result, fieldErrors } = remapDeprecatedKeys(input)
      assert.strictEqual(fieldErrors.length, 1)
      assert.strictEqual(fieldErrors[0].path, 'workerPoolSize')
      assert.match(fieldErrors[0].message, /worker\.poolMaxSize/)
      assert.match(fieldErrors[0].message, /conflicts with existing/)
      // The first writer wins; the conflicting source stays so its name
      // remains visible to the user via the error path.
      assert.strictEqual((result.worker as Record<string, unknown>).poolMaxSize, 8)
    })

    await it('should record fieldError on non-object intermediate', () => {
      const input = {
        log: 'not-an-object',
        logEnabled: true,
        stationTemplateURLs: [{ file: 'n7.json', numberOfStations: 1 }],
      }
      const { fieldErrors } = remapDeprecatedKeys(input)
      assert.strictEqual(fieldErrors.length, 1)
      assert.strictEqual(fieldErrors[0].path, 'logEnabled')
      assert.match(fieldErrors[0].message, /intermediate 'log' is not an object/)
    })

    await it('nested — should remap worker.elementStartDelay → worker.elementAddDelay', () => {
      const {
        config: result,
        fieldErrors,
        warnings,
      } = remapDeprecatedKeys({
        stationTemplateURLs: [{ file: 'nested.json', numberOfStations: 1 }],
        worker: { elementStartDelay: 250 },
      })
      assert.strictEqual(fieldErrors.length, 0)
      assert.deepStrictEqual(
        warnings.find(w => w.sourceKey === 'worker.elementStartDelay'),
        { canonicalDestination: 'worker.elementAddDelay', sourceKey: 'worker.elementStartDelay' }
      )
      const worker = result.worker as Record<string, unknown>
      assert.strictEqual(worker.elementAddDelay, 250)
      assert.strictEqual(worker.elementStartDelay, undefined)
    })

    await it('nested — should record fieldError on unequal worker.elementStartDelay vs elementAddDelay', () => {
      const { fieldErrors } = remapDeprecatedKeys({
        stationTemplateURLs: [{ file: 'nested-conflict.json', numberOfStations: 1 }],
        worker: { elementAddDelay: 100, elementStartDelay: 250 },
      })
      assert.strictEqual(fieldErrors.length, 1)
      assert.strictEqual(fieldErrors[0].path, 'worker.elementStartDelay')
    })
  })

  await describe('applyConfigurationMigration', async () => {
    await it('should bump $schemaVersion from 0 to CURRENT', () => {
      const result = applyConfigurationMigration(0, { foo: 'bar' }, 'test.json')
      assert.strictEqual(result.$schemaVersion, CURRENT_CONFIGURATION_SCHEMA_VERSION)
      assert.strictEqual(result.foo, 'bar')
    })

    await it('should not mutate the input config (immutability boundary)', () => {
      const input = { foo: 'bar' }
      const before = JSON.stringify(input)
      applyConfigurationMigration(0, input, 'test.json')
      const after = JSON.stringify(input)
      assert.strictEqual(before, after)
    })

    for (const [label, sourceVersion] of [
      ['unknown source version', 99],
      ['source version equal to CURRENT (no-op boundary)', CURRENT_CONFIGURATION_SCHEMA_VERSION],
      ['negative source version', -1],
    ] as const) {
      await it(`should throw for ${label}`, () => {
        assert.throws(
          () => applyConfigurationMigration(sourceVersion, { foo: 'bar' }, 'test.json'),
          {
            message: /No migration defined/,
          }
        )
      })
    }
  })
})
