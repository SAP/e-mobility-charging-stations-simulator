/**
 * @file Tests for ConfigurationValidation
 * @description Unit tests for the validation pipeline, error class shape, immutability, and asset round-trip
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { ZodError } from 'zod'

import { BaseError } from '../../src/exception/index.js'
import {
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEPRECATED_KEY_REMAPPINGS,
} from '../../src/utils/index.js'
import { ConfigurationValidationError, validateConfiguration } from '../../src/utils/index.js'
import { logger } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  buildLegacyConfiguration,
  buildMinimalConfiguration,
  buildV1WithDeprecatedKey,
} from './helpers/ConfigurationFixtures.js'

/** Expected error message for a v1 config missing `stationTemplateUrls`. */
const EXPECTED_SNAPSHOT =
  "ConfigurationValidation: Configuration validation failed [schema] for 'test.json':\n  - stationTemplateUrls: Invalid input: expected array, received undefined"

/**
 * Schema-valid sample value for each deprecated key in `DEPRECATED_KEY_REMAPPINGS`.
 * Used to exercise the deprecation-warning channel for every entry.
 * Dotted source keys (e.g. `'worker.elementStartDelay'`) are nested by
 * `buildV1WithDeprecatedKey`.
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
  stationTemplateURLs: [{ file: 'a.json', numberOfStations: 1 }],
  supervisionURLs: 'ws://localhost:8080',
  uiWebSocketServer: {},
  useWorkerPool: false,
  'worker.elementStartDelay': 100,
  workerPoolMaxSize: 16,
  workerPoolMinSize: 4,
  workerPoolSize: 16,
  workerPoolStrategy: 'ROUND_ROBIN',
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

    await it('should throw BaseError for $schemaVersion newer than supported (future-version pipeline)', () => {
      const future = buildMinimalConfiguration({
        $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION + 1,
      })
      assert.throws(
        () => validateConfiguration(future, 'future.json'),
        (error: unknown) =>
          error instanceof BaseError &&
          error.message.includes(
            `is newer than supported version ${CURRENT_CONFIGURATION_SCHEMA_VERSION.toString()}`
          )
      )
    })
  })

  await describe('migration pipeline', async () => {
    await it('should migrate buildLegacyConfiguration to current schema version', t => {
      t.mock.method(console, 'warn', () => undefined)
      const parsed = buildLegacyConfiguration()

      const result = validateConfiguration(parsed, 'legacy.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
      assert.strictEqual(result.log?.enabled, true)
      assert.strictEqual(result.worker?.processType, 'workerSet')
      assert.ok(Array.isArray(result.stationTemplateUrls))
      assert.strictEqual(result.stationTemplateUrls.length, 1)
      const raw = result as unknown as Record<string, unknown>
      assert.strictEqual(raw.logEnabled, undefined)
      assert.strictEqual(raw.workerProcess, undefined)
      assert.strictEqual(raw.stationTemplateURLs, undefined)
    })

    await it('should accept already-current v1 configuration without re-migrating', () => {
      const parsed = buildMinimalConfiguration()

      const result = validateConfiguration(parsed, 'current.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
    })

    await it('should accept string "$schemaVersion": "1" (no-migration path)', () => {
      const parsed = buildMinimalConfiguration({ $schemaVersion: '1' })

      const result = validateConfiguration(parsed, 'string-version.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
    })

    await it('should sweep deprecated keys unconditionally for v1 configs', t => {
      t.mock.method(console, 'warn', () => undefined)
      const parsed = buildV1WithDeprecatedKey('workerPoolSize', 16)

      const result = validateConfiguration(parsed, 'b3.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
      assert.strictEqual(result.worker?.poolMaxSize, 16)
      assert.strictEqual((result as unknown as Record<string, unknown>).workerPoolSize, undefined)
    })

    await it('should throw remap-phase ConfigurationValidationError on collision', t => {
      t.mock.method(console, 'warn', () => undefined)
      const parsed = {
        $schemaVersion: 1,
        stationTemplateUrls: [{ file: 'collision.json', numberOfStations: 1 }],
        workerPoolMaxSize: 8,
        workerPoolSize: 16,
      }
      assert.throws(
        () => validateConfiguration(parsed, 'collision.json'),
        (error: unknown) =>
          error instanceof ConfigurationValidationError &&
          error.phase === 'remap' &&
          error.fieldErrors.some(
            f => f.path === 'workerPoolSize' && f.message.includes('worker.poolMaxSize')
          )
      )
    })
  })

  await describe('ConfigurationValidationError shape', async () => {
    await it('should be a BaseError with name, fieldErrors, filePath, and phase set', () => {
      try {
        validateConfiguration({ $schemaVersion: 1 }, 'broken.json')
        assert.fail('Expected ConfigurationValidationError')
      } catch (error) {
        assert.ok(error instanceof ConfigurationValidationError)
        assert.ok(error instanceof BaseError)
        assert.strictEqual(error.name, 'ConfigurationValidationError')
        assert.strictEqual(error.filePath, 'broken.json')
        assert.strictEqual(error.phase, 'schema')
        assert.ok(Array.isArray(error.fieldErrors))
        assert.ok(error.fieldErrors.length > 0)
      }
    })

    await it('should be constructable directly from FieldError[] with phase=remap', () => {
      const error = new ConfigurationValidationError(
        [{ message: 'collision', path: 'workerPoolSize' }],
        { filePath: 'direct.json', phase: 'remap' }
      )
      assert.ok(error instanceof BaseError)
      assert.strictEqual(error.filePath, 'direct.json')
      assert.strictEqual(error.phase, 'remap')
      assert.strictEqual(error.fieldErrors.length, 1)
      assert.strictEqual(error.fieldErrors[0].path, 'workerPoolSize')
      assert.strictEqual(error.migratedFrom, undefined)
      assert.match(error.message, /\[remap\]/)
    })

    await it('should be constructable from a ZodError via fromZodError factory', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'array',
          message: 'Required',
          path: ['stationTemplateUrls'],
        },
      ])
      const error = ConfigurationValidationError.fromZodError(zodError, { filePath: 'direct.json' })

      assert.ok(error instanceof BaseError)
      assert.strictEqual(error.filePath, 'direct.json')
      assert.strictEqual(error.phase, 'schema')
      assert.strictEqual(error.fieldErrors.length, 1)
      assert.strictEqual(error.fieldErrors[0].path, 'stationTemplateUrls')
      assert.strictEqual(error.migratedFrom, undefined)
      assert.match(error.message, /\[schema\]/)
    })

    await it('should include migratedFrom note in message when provided', () => {
      const error = new ConfigurationValidationError([], {
        filePath: 'migrated.json',
        migratedFrom: 0,
        phase: 'schema',
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
      t.mock.method(console, 'warn', () => undefined)
      const parsed = buildLegacyConfiguration()
      const before = structuredClone(parsed)

      validateConfiguration(parsed, 'immutable.json')

      assert.deepStrictEqual(parsed, before)
    })

    await it('should return a deep clone whose mutation does not leak into a subsequent validation', t => {
      t.mock.method(console, 'warn', () => undefined)
      const parsed = buildMinimalConfiguration({
        log: { enabled: true },
        worker: { processType: 'workerSet' },
      })

      const first = validateConfiguration(parsed, 'mut.json')
      const second = validateConfiguration(parsed, 'mut.json')

      assert.notStrictEqual(first, second)
      assert.notStrictEqual(first.log, second.log)
      assert.notStrictEqual(first.worker, second.worker)
      assert.notStrictEqual(first.stationTemplateUrls, second.stationTemplateUrls)
      assert.notStrictEqual(first.stationTemplateUrls[0], second.stationTemplateUrls[0])
      ;(first as unknown as Record<string, unknown>).bogusMutation = 'mutated'
      if (first.log != null) {
        first.log.enabled = false
      }
      first.stationTemplateUrls.length = 0

      const third = validateConfiguration(parsed, 'mut.json')
      assert.strictEqual(third.log?.enabled, true)
      assert.strictEqual(third.worker?.processType, 'workerSet')
      assert.strictEqual(third.stationTemplateUrls.length, 1)
      assert.strictEqual((third as unknown as Record<string, unknown>).bogusMutation, undefined)
    })
  })

  await describe('deprecation warnings emitted via console.warn', async () => {
    for (const legacyKey of Object.keys(DEPRECATED_KEY_REMAPPINGS)) {
      await it(`should warn about deprecated key '${legacyKey}'`, t => {
        const warnMock = t.mock.method(console, 'warn', () => undefined)
        const sampleValue = SAMPLE_DEPRECATED_VALUES[legacyKey]
        assert.notStrictEqual(
          sampleValue,
          undefined,
          `Missing SAMPLE_DEPRECATED_VALUES entry for ${legacyKey}`
        )
        const parsed = buildV1WithDeprecatedKey(legacyKey, sampleValue)

        // Warning must fire before downstream schema validation rejects boolean→enum / array remaps.
        try {
          validateConfiguration(parsed, `${legacyKey}.json`)
        } catch {
          // schema rejection is expected for these cases
        }

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

    await it('should emit deprecation warnings via console.warn, never via logger.warn', t => {
      const consoleMock = t.mock.method(console, 'warn', () => undefined)
      const loggerMock = t.mock.method(logger, 'warn')
      const parsed = buildV1WithDeprecatedKey('workerPoolSize', 16)

      const result = validateConfiguration(parsed, 'b1.json')

      assert.strictEqual(
        (result as unknown as Record<string, unknown>).$schemaVersion,
        CURRENT_CONFIGURATION_SCHEMA_VERSION
      )
      assert.strictEqual(consoleMock.mock.calls.length, 1, 'console.warn should fire exactly once')
      assert.strictEqual(
        loggerMock.mock.calls.length,
        0,
        'logger.warn must not be called from validateConfiguration (re-entrance regression)'
      )
    })
  })

  await describe('migration is the single source of truth', async () => {
    await it('should produce equivalent canonical shape from legacy and canonical inputs', t => {
      t.mock.method(console, 'warn', () => undefined)
      const legacy = buildLegacyConfiguration({ logEnabled: false, workerProcess: 'fixedPool' })
      const validatedFromLegacy = validateConfiguration(legacy, 'legacy.json')

      const canonical = buildMinimalConfiguration({
        log: { enabled: false },
        worker: { processType: 'fixedPool' },
      })
      const validatedFromCanonical = validateConfiguration(canonical, 'canonical.json')

      assert.strictEqual(validatedFromLegacy.log?.enabled, validatedFromCanonical.log?.enabled)
      assert.strictEqual(
        validatedFromLegacy.worker?.processType,
        validatedFromCanonical.worker?.processType
      )
    })
  })

  await describe('round-trip on real assets', async () => {
    await it('should validate src/assets/config-template.json through the pipeline', t => {
      t.mock.method(console, 'warn', () => undefined)
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

    await it('should validate docker/config.json through the pipeline', t => {
      t.mock.method(console, 'warn', () => undefined)
      const dockerConfigPath = join(import.meta.dirname, '../../docker/config.json')
      const parsed = JSON.parse(readFileSync(dockerConfigPath, 'utf8')) as Record<string, unknown>

      const result = validateConfiguration(parsed, 'docker/config.json')

      assert.ok(result, 'docker/config.json should validate successfully')
      const { uiServer } = result
      if (uiServer == null) {
        assert.fail('docker/config.json should define uiServer')
      }
      const { accessPolicy } = uiServer
      if (accessPolicy == null) {
        assert.fail('docker/config.json should define uiServer.accessPolicy')
      }
      assert.deepStrictEqual(accessPolicy.allowedHosts, ['localhost', '127.0.0.1', '::1'])
      assert.strictEqual(accessPolicy.requireTlsForNonLoopback, false)

      const dockerComposePath = join(import.meta.dirname, '../../docker/docker-compose.yml')
      const dockerCompose = readFileSync(dockerComposePath, 'utf8')
      assert.match(dockerCompose, /127\.0\.0\.1:8080:8080/)
    })

    await it('should validate the hardcoded fallback object from Configuration.ts', t => {
      t.mock.method(console, 'warn', () => undefined)
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

    await it('should fail-fast with structured uiServer.options.port path on invalid port', () => {
      const parsed = buildMinimalConfiguration({
        uiServer: {
          enabled: true,
          options: { host: 'localhost', port: 'not-a-number' },
          type: 'ws',
        },
      })
      try {
        validateConfiguration(parsed, 'bad-port.json')
        assert.fail('Expected ConfigurationValidationError')
      } catch (error) {
        assert.ok(error instanceof ConfigurationValidationError)
        assert.strictEqual(error.phase, 'schema')
        const portErrors = error.fieldErrors.filter(e => e.path === 'uiServer.options.port')
        assert.strictEqual(
          portErrors.length,
          1,
          `Expected one fieldError on 'uiServer.options.port', got ${JSON.stringify(error.fieldErrors)}`
        )
        assert.match(error.message, /uiServer\.options\.port/)
        assert.match(error.message, /\[schema\]/)
      }
    })
  })
})
