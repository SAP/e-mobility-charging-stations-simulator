/**
 * @file Tests for ConfigurationSchema
 * @description Unit tests for Zod configuration schema validation
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import { CURRENT_CONFIGURATION_SCHEMA_VERSION } from '../../src/charging-station/ConfigurationMigrations.js'
import { ConfigurationSchema } from '../../src/charging-station/ConfigurationSchema.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  BAD_FIXTURES,
  buildFullConfiguration,
  buildMinimalConfiguration,
} from './helpers/ConfigurationFixtures.js'

await describe('ConfigurationSchema', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('required fields', async () => {
    await it('should accept a minimal valid configuration', () => {
      const result = ConfigurationSchema.safeParse(buildMinimalConfiguration())
      assert.ok(result.success)
      assert.strictEqual(result.data.$schemaVersion, CURRENT_CONFIGURATION_SCHEMA_VERSION)
    })

    await it('should accept a fully-populated configuration', () => {
      const result = ConfigurationSchema.safeParse(buildFullConfiguration())
      assert.ok(result.success)
    })

    for (const [label, value, expectedErrorPath] of BAD_FIXTURES) {
      await it(`should reject: ${label}`, () => {
        const result = ConfigurationSchema.safeParse(value)
        assert.ok(!result.success, `Expected failure for: ${label}`)
        if (expectedErrorPath !== '') {
          const paths = result.error.issues.flatMap(i => i.path.join('.'))
          assert.ok(
            paths.some(p => p.includes(expectedErrorPath)),
            `Expected error path '${expectedErrorPath}' in ${JSON.stringify(paths)}`
          )
        }
      })
    }
  })

  await describe('$schemaVersion', async () => {
    await it('should reject missing $schemaVersion', () => {
      const result = ConfigurationSchema.safeParse({
        stationTemplateUrls: [{ file: 'a.json', numberOfStations: 1 }],
      })
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.includes('$schemaVersion')))
    })

    await it('should accept explicit $schemaVersion equal to CURRENT_CONFIGURATION_SCHEMA_VERSION', () => {
      const result = ConfigurationSchema.safeParse(buildMinimalConfiguration())
      assert.ok(result.success)
      assert.strictEqual(result.data.$schemaVersion, CURRENT_CONFIGURATION_SCHEMA_VERSION)
    })

    await it('should reject $schemaVersion not equal to CURRENT_CONFIGURATION_SCHEMA_VERSION', () => {
      const result = ConfigurationSchema.safeParse(buildMinimalConfiguration({ $schemaVersion: 0 }))
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.includes('$schemaVersion')))
    })
  })

  await describe('strict top-level', async () => {
    await it('should reject unknown top-level key', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ bogusUnknownKey: 42 })
      )
      assert.ok(!result.success)
    })
  })

  await describe('deprecated keys accepted', async () => {
    for (const [key, value] of [
      ['autoReconnectMaxRetries', -1],
      ['chargingStationsPerWorker', 2],
      ['distributeStationToTenantEqually', true],
      ['distributeStationsToTenantsEqually', false],
      ['elementAddDelay', 0],
      ['logConsole', false],
      ['logEnabled', true],
      ['logErrorFile', 'logs/error.log'],
      ['logFile', 'logs/combined.log'],
      ['logFormat', 'simple'],
      ['logLevel', 'info'],
      ['logMaxFiles', 7],
      ['logMaxSize', '10m'],
      ['logRotate', true],
      ['logStatisticsInterval', 60],
      ['stationTemplateURLs', [{ file: 'a.json', numberOfStations: 1 }]],
      ['supervisionURLs', 'ws://localhost:8080'],
      ['uiWebSocketServer', {}],
      ['useWorkerPool', false],
      ['workerPoolMaxSize', 16],
      ['workerPoolMinSize', 4],
      ['workerPoolSize', 8],
      ['workerPoolStrategy', 'ROUND_ROBIN'],
      ['workerProcess', 'workerSet'],
      ['workerStartDelay', 500],
    ] as const) {
      await it(`should accept deprecated key '${key}'`, () => {
        const result = ConfigurationSchema.safeParse(buildMinimalConfiguration({ [key]: value }))
        assert.ok(
          result.success,
          `Expected deprecated key '${key}' to be accepted, got: ${result.success ? '' : JSON.stringify(result.error.issues)}`
        )
      })
    }
  })

  await describe('sub-section schemas', async () => {
    await it('should accept valid log section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          log: { enabled: true, file: 'logs/combined.log', level: 'info', rotate: true },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject unknown key in log section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ log: { unknownLogKey: true } })
      )
      assert.ok(!result.success)
    })

    await it('should accept valid worker section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          worker: { elementsPerWorker: 'auto', processType: 'workerSet', startDelay: 500 },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject invalid worker.processType', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { processType: 'invalid' } })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('worker.processType')))
    })

    await it('should accept valid performanceStorage section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ performanceStorage: { enabled: true, type: 'none' } })
      )
      assert.ok(result.success)
    })

    await it('should accept valid uiServer section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            enabled: false,
            options: { host: 'localhost', port: 8080 },
            type: 'ws',
            version: '1.1',
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should accept uiServer with authentication', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            authentication: {
              enabled: true,
              password: 'admin',
              type: 'protocol-basic-auth',
              username: 'admin',
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject unknown key in worker section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { unknownWorkerKey: true } })
      )
      assert.ok(!result.success)
    })
  })

  await describe('mixed-type fields', async () => {
    await it('should accept supervisionUrls as string', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ supervisionUrls: 'ws://localhost:8080' })
      )
      assert.ok(result.success)
    })

    await it('should accept supervisionUrls as string array', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          supervisionUrls: ['ws://localhost:8080', 'ws://localhost:8081'],
        })
      )
      assert.ok(result.success)
    })

    await it('should accept worker.elementsPerWorker as auto', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { elementsPerWorker: 'auto' } })
      )
      assert.ok(result.success)
    })

    await it('should accept worker.elementsPerWorker as all', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { elementsPerWorker: 'all' } })
      )
      assert.ok(result.success)
    })

    await it('should accept worker.elementsPerWorker as positive integer', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { elementsPerWorker: 4 } })
      )
      assert.ok(result.success)
    })

    await it('should accept log.maxFiles as number', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ log: { maxFiles: 7 } })
      )
      assert.ok(result.success)
    })

    await it('should accept log.maxFiles as string', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ log: { maxFiles: '14d' } })
      )
      assert.ok(result.success)
    })
  })

  await describe('enum constraints', async () => {
    await it('should accept valid supervisionUrlDistribution', () => {
      for (const val of ['round-robin', 'random', 'charging-station-affinity']) {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({ supervisionUrlDistribution: val })
        )
        assert.ok(result.success, `Expected '${val}' to be valid`)
      }
    })

    await it('should reject invalid supervisionUrlDistribution', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ supervisionUrlDistribution: 'invalid' })
      )
      assert.ok(!result.success)
    })

    await it('should accept valid log.level values', () => {
      for (const level of [
        'emerg',
        'alert',
        'crit',
        'error',
        'warning',
        'notice',
        'info',
        'debug',
      ]) {
        const result = ConfigurationSchema.safeParse(buildMinimalConfiguration({ log: { level } }))
        assert.ok(result.success, `Expected log.level '${level}' to be valid`)
      }
    })

    await it('should reject invalid log.level', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ log: { level: 'verbose' } })
      )
      assert.ok(!result.success)
    })
  })

  await describe('external-type bridges', async () => {
    await it('should accept uiServer.options as arbitrary ListenOptions object (z.custom bridge)', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            enabled: false,
            options: {
              backlog: 511,
              exclusive: true,
              host: '127.0.0.1',
              ipv6Only: false,
              port: 9090,
            },
            type: 'ws',
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should accept worker.resourceLimits as arbitrary ResourceLimits object (z.custom bridge)', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          worker: {
            resourceLimits: {
              codeRangeSizeMb: 16,
              maxOldGenerationSizeMb: 256,
              maxYoungGenerationSizeMb: 64,
              stackSizeMb: 4,
            },
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should accept empty uiServer.options object', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: { enabled: false, options: {}, type: 'ws' },
        })
      )
      assert.ok(result.success)
    })

    await it('should accept worker.elementStartDelay deprecated alias', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { elementStartDelay: 0 } })
      )
      assert.ok(result.success)
    })

    await it('should accept performanceStorage.URI deprecated alias', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          performanceStorage: { type: 'jsonfile', URI: 'file:///tmp/perf.json' },
        })
      )
      assert.ok(result.success)
    })
  })

  await describe('round-trip on real config-template.json', async () => {
    await it('should validate src/assets/config-template.json successfully', () => {
      const raw = JSON.parse(readFileSync('src/assets/config-template.json', 'utf8')) as unknown
      const result = ConfigurationSchema.safeParse(raw)
      assert.ok(
        result.success,
        `config-template.json failed schema validation: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      )
    })
  })

  await describe('round-trip on hardcoded fallback (RG-4)', async () => {
    // Mirrors the in-memory fallback object from src/utils/Configuration.ts:110-123
    // augmented with the required $schemaVersion. RG-4 guards against drift
    // between the hardcoded fallback shape and the canonical schema.
    await it('should validate the hardcoded Configuration.ts fallback object', () => {
      const hardcodedFallback = {
        $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION,
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
          options: {
            host: 'localhost',
            port: 8080,
          },
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
      const result = ConfigurationSchema.safeParse(hardcodedFallback)
      assert.ok(
        result.success,
        `hardcoded fallback failed schema validation: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      )
      assert.strictEqual(result.data.$schemaVersion, CURRENT_CONFIGURATION_SCHEMA_VERSION)
    })
  })
})
