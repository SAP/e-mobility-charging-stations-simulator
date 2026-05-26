/**
 * @file Tests for ConfigurationValidation
 * @description Unit tests for the simulator configuration validation pipeline:
 * payload guards, migration → schema validation → transform warnings,
 * error class shape, immutability, and round-trip on real assets.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { ZodError } from 'zod'

import {
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEPRECATED_KEY_REMAPPINGS,
} from '../../src/charging-station/ConfigurationMigrations.js'
import {
  ConfigurationValidationError,
  validateConfiguration,
} from '../../src/charging-station/ConfigurationValidation.js'
import { BaseError } from '../../src/exception/index.js'
import { logger } from '../../src/utils/index.js'
import { mockLoggerWarnDebug, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  buildLegacyConfiguration,
  buildMinimalConfiguration,
} from './helpers/ConfigurationFixtures.js'

/**
 * Exact error message produced by validateConfiguration({ $schemaVersion: 1 }, 'test.json').
 * Captures the full Zod validation failure for the missing stationTemplateUrls field.
 */
const EXPECTED_SNAPSHOT =
  "ConfigurationValidation: Configuration validation failed for 'test.json':\n  - stationTemplateUrls: Invalid input: expected array, received undefined"

/**
 * Schema-valid sample value for each deprecated top-level key.
 * Used to exercise `transformConfiguration` warnings without triggering
 * `ConfigurationSchema` rejections (each entry must satisfy the schema's
 * declared type for the corresponding deprecated key).
 */
const SAMPLE_DEPRECATED_VALUES: Readonly<Record<string, unknown>> = {
  autoReconnectMaxRetries: 5,
  chargingStationsPerWorker: 1,
  distributeStationsToTenantsEqually: true,
  distributeStationToTenantEqually: true,
  elementAddDelay: 0,
  logConsole: false,
  logEnabled: true,
  logErrorFile: 'logs/error.log',
  logFile: 'logs/combined.log',
  logFormat: 'simple',
  logLevel: 'info',
  logMaxFiles: 7,
  logMaxSize: '10m',
  logRotate: true,
  logStatisticsInterval: 60,
  stationTemplateURLs: [],
  supervisionURLs: 'ws://localhost:8080',
  uiWebSocketServer: {},
  useWorkerPool: false,
  workerPoolMaxSize: 16,
  workerPoolMinSize: 4,
  workerPoolSize: 16,
  workerPoolStrategy: 'workerSet',
  workerProcess: 'workerSet',
  workerStartDelay: 500,
}

await describe('ConfigurationValidation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('validateConfiguration guards', async () => {
    for (const [label, payload] of [
      ['null', null],
      ['string', 'not-an-object'],
      ['array', [1, 2, 3]],
    ] as const) {
      await it(`should throw BaseError 'Invalid' for ${label} payload`, () => {
        assert.throws(
          () => validateConfiguration(payload, `${label}.json`),
          (error: unknown) =>
            error instanceof BaseError &&
            error.message.includes('Invalid simulator configuration payload (not a JSON object)')
        )
      })
    }

    await it("should throw BaseError 'Empty' for {}", () => {
      assert.throws(
        () => validateConfiguration({}, 'empty.json'),
        (error: unknown) =>
          error instanceof BaseError &&
          error.message.includes('Empty simulator configuration from file')
      )
    })
  })

  await describe('migration pipeline', async () => {
    await it('should migrate buildLegacyConfiguration to current schema version', t => {
      mockLoggerWarnDebug(t, logger)
      const parsed = buildLegacyConfiguration()

      const result = validateConfiguration(parsed, 'legacy.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
      // Migration should have remapped legacy keys; canonical destinations populated.
      assert.strictEqual(result.log?.enabled, true)
      assert.strictEqual(result.worker?.processType, 'workerSet')
      assert.ok(Array.isArray(result.stationTemplateUrls))
      assert.strictEqual(result.stationTemplateUrls.length, 1)
      // Legacy keys should be removed from the migrated output.
      const raw = result as unknown as Record<string, unknown>
      assert.strictEqual(raw.logEnabled, undefined)
      assert.strictEqual(raw.workerProcess, undefined)
      assert.strictEqual(raw.stationTemplateURLs, undefined)
    })

    await it('should accept already-current v1 configuration without migration', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalConfiguration()

      const result = validateConfiguration(parsed, 'current.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
    })

    await it('should accept string "$schemaVersion": "1" (no-migration path)', t => {
      t.mock.method(logger, 'warn')
      const parsed = buildMinimalConfiguration({ $schemaVersion: '1' })

      const result = validateConfiguration(parsed, 'string-version.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
    })
  })

  await describe('ConfigurationValidationError shape', async () => {
    await it('should be a BaseError with name, fieldErrors, and filePath set', () => {
      try {
        validateConfiguration({ $schemaVersion: 1 }, 'broken.json')
        assert.fail('Expected ConfigurationValidationError')
      } catch (error) {
        assert.ok(error instanceof ConfigurationValidationError)
        assert.ok(error instanceof BaseError)
        assert.strictEqual(error.name, 'ConfigurationValidationError')
        assert.strictEqual(error.filePath, 'broken.json')
        assert.ok(Array.isArray(error.fieldErrors))
        assert.ok(error.fieldErrors.length > 0)
      }
    })

    await it('should be constructable directly from a ZodError', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'array',
          message: 'Required',
          path: ['stationTemplateUrls'],
        },
      ])
      const error = new ConfigurationValidationError(zodError, { filePath: 'direct.json' })

      assert.ok(error instanceof BaseError)
      assert.strictEqual(error.filePath, 'direct.json')
      assert.strictEqual(error.fieldErrors.length, 1)
      assert.strictEqual(error.fieldErrors[0].path, 'stationTemplateUrls')
      assert.strictEqual(error.migratedFrom, undefined)
    })

    await it('should include migratedFrom note in message when provided', () => {
      const error = new ConfigurationValidationError(new ZodError([]), {
        filePath: 'migrated.json',
        migratedFrom: 0,
      })

      assert.strictEqual(error.migratedFrom, 0)
      assert.match(
        error.message,
        new RegExp(`migrated from v0 → v${CURRENT_CONFIGURATION_SCHEMA_VERSION.toString()}`)
      )
    })

    await it('should aggregate multiple fieldErrors when several violations are present', () => {
      try {
        validateConfiguration(
          {
            $schemaVersion: 1,
            log: 'not-an-object',
            stationTemplateUrls: 'not-an-array',
            worker: 123,
          },
          'multi.json'
        )
        assert.fail('Expected ConfigurationValidationError')
      } catch (error) {
        assert.ok(error instanceof ConfigurationValidationError)
        assert.strictEqual(error.fieldErrors.length, 3)
        const paths = error.fieldErrors.map(e => e.path)
        assert.ok(paths.includes('stationTemplateUrls'))
        assert.ok(paths.includes('log'))
        assert.ok(paths.includes('worker'))
      }
    })
  })

  await describe('immutability', async () => {
    await it('should not mutate the caller-supplied parsed object', t => {
      mockLoggerWarnDebug(t, logger)
      const parsed = buildLegacyConfiguration()
      const before = structuredClone(parsed)

      validateConfiguration(parsed, 'immutable.json')

      assert.deepStrictEqual(parsed, before)
    })
  })

  await describe('transformConfiguration deprecation warnings', async () => {
    for (const legacyKey of Object.keys(DEPRECATED_KEY_REMAPPINGS)) {
      await it(`should warn about deprecated top-level key '${legacyKey}'`, t => {
        const warnMock = t.mock.method(logger, 'warn')
        const sampleValue = SAMPLE_DEPRECATED_VALUES[legacyKey]
        assert.notStrictEqual(
          sampleValue,
          undefined,
          `Missing SAMPLE_DEPRECATED_VALUES entry for ${legacyKey}`
        )
        // v1 config keeps the deprecated key (no migration runs); transform must warn.
        const parsed = buildMinimalConfiguration({ [legacyKey]: sampleValue })

        validateConfiguration(parsed, `${legacyKey}.json`)

        const warnMessages = warnMock.mock.calls.map(c =>
          typeof c.arguments[0] === 'string' ? c.arguments[0] : ''
        )
        assert.ok(
          warnMessages.some(
            m => m.includes(`'${legacyKey}'`) && m.includes('deprecated configuration key')
          ),
          `Expected deprecation warning for '${legacyKey}'; got: ${JSON.stringify(warnMessages)}`
        )
      })
    }
  })

  await describe('round-trip on real assets', async () => {
    await it('should validate src/assets/config-template.json through the pipeline', t => {
      mockLoggerWarnDebug(t, logger)
      const templatePath = join(import.meta.dirname, '../../src/assets/config-template.json')
      const parsed = JSON.parse(readFileSync(templatePath, 'utf8')) as Record<string, unknown>

      const result = validateConfiguration(parsed, 'config-template.json')

      assert.ok(result, 'config-template.json should validate successfully')
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
      assert.ok(Array.isArray(result.stationTemplateUrls))
      assert.ok(result.stationTemplateUrls.length > 0)
    })

    await it('should validate the hardcoded fallback object from Configuration.ts', t => {
      mockLoggerWarnDebug(t, logger)
      // Mirror of the fallback assigned in src/utils/Configuration.ts when
      // src/assets/config.json is absent. Built at v0 (no `$schemaVersion`)
      // so the migration step lifts it to the current schema version.
      const hardcodedFallback = {
        log: {
          enabled: true,
          errorFile: 'logs/error.log',
          file: 'logs/combined.log',
          format: 'simple',
          level: 'info',
          rotate: true,
          statisticsInterval: 60,
        },
        performanceStorage: {
          enabled: true,
          type: 'none',
        },
        stationTemplateUrls: [
          {
            file: 'siemens.station-template.json',
            numberOfStations: 1,
          },
        ],
        supervisionUrlDistribution: 'round-robin',
        supervisionUrls: 'ws://localhost:8180/steve/websocket/CentralSystemService',
        uiServer: {
          enabled: false,
          options: { host: 'localhost', port: 8080 },
          type: 'ws',
          version: '1.1',
        },
        worker: {
          elementAddDelay: 0,
          elementsPerWorker: 'auto',
          poolMaxSize: 16,
          poolMinSize: 4,
          processType: 'workerSet',
          startDelay: 500,
        },
      }

      const result = validateConfiguration(hardcodedFallback, 'hardcoded-fallback')

      assert.ok(result, 'Hardcoded fallback should validate successfully')
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
      assert.strictEqual(result.supervisionUrlDistribution, 'round-robin')
      assert.strictEqual(result.worker?.processType, 'workerSet')
    })
  })

  await describe('error message snapshot', async () => {
    await it('should match error message snapshot', () => {
      try {
        validateConfiguration({ $schemaVersion: 1 }, 'test.json')
        assert.fail('Expected ConfigurationValidationError')
      } catch (error) {
        assert.ok(error instanceof ConfigurationValidationError)
        assert.strictEqual(error.message, EXPECTED_SNAPSHOT)
      }
    })
  })
})
