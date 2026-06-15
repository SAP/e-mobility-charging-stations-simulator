/**
 * @file Tests for ConfigurationSchema
 * @description Unit tests for Zod configuration schema validation
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import {
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEPRECATED_KEY_REMAPPINGS,
} from '../../src/utils/index.js'
import {
  ConfigurationSchema,
  UI_SERVER_ACCESS_POLICY_DEFAULTS,
  WorkerConfigurationSchema,
} from '../../src/utils/index.js'
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

    await it('should accept valid uiServer access policy', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              allowedHosts: ['gateway.example.com'],
              allowedOrigins: ['https://gateway.example.com'],
              allowLoopbackProxy: true,
              requireTlsForNonLoopback: true,
              trustedProxies: ['127.0.0.1'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(result.success)
    })

    await it('should reject unknown key in uiServer access policy', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              unknownPolicyKey: true,
            },
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('uiServer.accessPolicy')))
    })

    await it('should reject misplaced access policy under uiServer options', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            options: {
              accessPolicy: {
                requireTlsForNonLoopback: false,
              },
              host: 'localhost',
              port: 8080,
            },
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('uiServer.options')))
    })

    await it('should reject uiServer options as null with object-shape message', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            options: null,
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(
        result.error.issues.some(
          i =>
            i.path.join('.').includes('uiServer.options') && i.message.includes('non-array object')
        )
      )
    })

    await it('should reject uiServer options as array with object-shape message', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            options: [],
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(
        result.error.issues.some(
          i =>
            i.path.join('.').includes('uiServer.options') && i.message.includes('non-array object')
        )
      )
    })

    await describe('uiServer.options.port', async () => {
      await it('should reject non-numeric string port "not-a-number"', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 'not-a-number' } },
          })
        )
        assert.ok(!result.success)
        const paths = result.error.issues.map(i => i.path.join('.'))
        assert.ok(
          paths.includes('uiServer.options.port'),
          `Expected error path 'uiServer.options.port' in ${JSON.stringify(paths)}`
        )
      })

      await it('should reject negative port (-1)', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: -1 } },
          })
        )
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.join('.') === 'uiServer.options.port'))
      })

      await it('should reject port 65536 (out of range)', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 65536 } },
          })
        )
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.join('.') === 'uiServer.options.port'))
      })

      await it('should reject non-integer port 3.14', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 3.14 } },
          })
        )
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.join('.') === 'uiServer.options.port'))
      })

      await it('should accept port 8080', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 8080 } },
          })
        )
        assert.ok(
          result.success,
          `Expected port 8080 to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
        )
      })

      await it('should accept port 0 (OS-picked port)', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 0 } },
          })
        )
        assert.ok(
          result.success,
          `Expected port 0 to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
        )
      })

      await it('should accept port 65535 (max valid)', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 65535 } },
          })
        )
        assert.ok(
          result.success,
          `Expected port 65535 to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
        )
      })
    })

    await describe('uiServer.options.host', async () => {
      await it('should reject empty host string', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: '', port: 8080 } },
          })
        )
        assert.ok(!result.success)
        const paths = result.error.issues.map(i => i.path.join('.'))
        assert.ok(
          paths.includes('uiServer.options.host'),
          `Expected error path 'uiServer.options.host' in ${JSON.stringify(paths)}`
        )
      })

      await it('should accept host "localhost"', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 'localhost', port: 8080 } },
          })
        )
        assert.ok(
          result.success,
          `Expected host 'localhost' to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
        )
      })

      await it('should reject non-string host', () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: { options: { host: 1234, port: 8080 } },
          })
        )
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.join('.') === 'uiServer.options.host'))
      })
    })

    await it('should reject hostnames in trustedProxies', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              trustedProxies: ['nginx.internal'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('trustedProxies')))
    })

    await it('should reject CIDR ranges in trustedProxies', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              trustedProxies: ['10.0.0.0/8'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('trustedProxies')))
    })

    await it('should accept IPv4 and IPv6 literals in trustedProxies', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              trustedProxies: ['10.0.0.1', '2001:db8::1', '::ffff:127.0.0.1'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(
        result.success,
        `Expected IP literals to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      )
    })

    await it('should reject malformed allowedHosts entries', () => {
      for (const malformedHost of [
        'a:b:c',
        'localhost:bad',
        '[::1]:99999',
        '[::1]:abc',
        '',
        'a.example.com, b.example.com',
        'foo bar',
        'localhost:0',
        '[bad',
      ]) {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: {
              accessPolicy: {
                allowedHosts: [malformedHost],
              },
              enabled: true,
              type: 'ws',
            },
          })
        )
        assert.ok(
          !result.success,
          `Expected '${malformedHost}' to be rejected as allowedHosts entry`
        )
        assert.ok(result.error.issues.some(i => i.path.join('.').includes('allowedHosts')))
      }
    })

    await it('should reject allowedHosts entries with a port', () => {
      for (const portBearingHost of [
        'gateway.example.com:8080',
        '127.0.0.1:8080',
        '127.0.0.1:08080',
        '[::1]:8080',
      ]) {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({
            uiServer: {
              accessPolicy: {
                allowedHosts: [portBearingHost],
              },
              enabled: true,
              type: 'ws',
            },
          })
        )
        assert.ok(
          !result.success,
          `Expected '${portBearingHost}' to be rejected as allowedHosts entry`
        )
        assert.ok(result.error.issues.some(i => i.path.join('.').includes('allowedHosts')))
      }
    })

    await it('should accept hostnames and IP literals in allowedHosts', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              allowedHosts: ['gateway.example.com', '127.0.0.1', '[::1]', 'localhost'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(
        result.success,
        `Expected valid hosts to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      )
    })

    await it('should expose canonical UI server access policy defaults', () => {
      assert.deepStrictEqual(UI_SERVER_ACCESS_POLICY_DEFAULTS, {
        allowedHosts: [],
        allowedOrigins: [],
        allowLoopbackProxy: false,
        requireTlsForNonLoopback: true,
        trustedProxies: [],
      })
    })

    await it('should accept allowedOrigins entries with no path, query, or fragment', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              allowedOrigins: ['https://app.example.com', 'https://app.example.com/'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(
        result.success,
        `Expected origin URLs to be accepted: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      )
    })

    await it('should reject allowedOrigins entries with a path', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              allowedOrigins: ['https://app.example.com/admin'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('allowedOrigins')))
    })

    await it('should reject allowedOrigins entries with a query string', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              allowedOrigins: ['https://app.example.com?token=x'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('allowedOrigins')))
    })

    await it('should reject allowedOrigins entries with a fragment', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            accessPolicy: {
              allowedOrigins: ['https://app.example.com#fragment'],
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').includes('allowedOrigins')))
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

  await describe('round-trip on hardcoded fallback', async () => {
    // Mirrors the in-memory fallback in Configuration.ts; guards against drift.
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
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
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

  await describe('strict sub-section parity', async () => {
    await it('should reject unknown key in performanceStorage section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ performanceStorage: { bogusStorageKey: true } })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.').startsWith('performanceStorage')))
    })

    await it('should reject unknown key in uiServer.authentication section', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          uiServer: {
            authentication: {
              bogusAuthKey: 'x',
              enabled: true,
              type: 'protocol-basic-auth',
            },
            enabled: true,
            type: 'ws',
          },
        })
      )
      assert.ok(!result.success)
    })
  })

  await describe('StationTemplateUrl entries', async () => {
    await it('should reject empty file string', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          stationTemplateUrls: [{ file: '', numberOfStations: 1 }],
        })
      )
      assert.ok(!result.success)
      assert.ok(result.error.issues.some(i => i.path.join('.') === 'stationTemplateUrls.0.file'))
    })

    await it('should reject negative numberOfStations', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          stationTemplateUrls: [{ file: 'a.json', numberOfStations: -1 }],
        })
      )
      assert.ok(!result.success)
    })

    await it('should accept deprecated numberOfStation alias', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          stationTemplateUrls: [{ file: 'a.json', numberOfStation: 1, numberOfStations: 1 }],
        })
      )
      assert.ok(
        result.success,
        `Expected deprecated numberOfStation to be accepted, got: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      )
    })

    await it('should reject unknown key in stationTemplateUrls entry', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({
          stationTemplateUrls: [{ bogusEntryKey: 1, file: 'a.json', numberOfStations: 1 }],
        })
      )
      assert.ok(!result.success)
    })
  })

  await describe('worker numeric constraints', async () => {
    for (const invalid of [0, -1] as const) {
      await it(`should reject worker.elementsPerWorker = ${invalid.toString()}`, () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({ worker: { elementsPerWorker: invalid } })
        )
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.join('.') === 'worker.elementsPerWorker'))
      })
    }

    await it('should reject worker.poolMaxSize = 0', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { poolMaxSize: 0 } })
      )
      assert.ok(!result.success)
    })

    await it('should reject worker.poolMinSize = -1', () => {
      const result = ConfigurationSchema.safeParse(
        buildMinimalConfiguration({ worker: { poolMinSize: -1 } })
      )
      assert.ok(!result.success)
    })
  })

  await describe('log numeric constraints', async () => {
    for (const invalid of [-1, 1.5] as const) {
      await it(`should reject log.statisticsInterval = ${invalid.toString()}`, () => {
        const result = ConfigurationSchema.safeParse(
          buildMinimalConfiguration({ log: { statisticsInterval: invalid } })
        )
        assert.ok(!result.success)
        assert.ok(result.error.issues.some(i => i.path.join('.') === 'log.statisticsInterval'))
      })
    }
  })

  await describe('schema / DEPRECATED_KEY_REMAPPINGS sync', async () => {
    interface SchemaShapeEntry {
      description?: string
    }
    interface ZodObjectLike {
      shape: Record<string, SchemaShapeEntry>
    }

    await it('should mark every top-level DEPRECATED_KEY_REMAPPINGS entry as @deprecated in the schema', () => {
      const shape = (ConfigurationSchema as unknown as ZodObjectLike).shape
      for (const legacy of Object.keys(DEPRECATED_KEY_REMAPPINGS)) {
        if (legacy.includes('.')) {
          continue
        }
        const entry = shape[legacy]
        assert.notStrictEqual(entry, undefined, `Schema is missing top-level key '${legacy}'`)
        assert.match(
          entry.description ?? '',
          /@deprecated/,
          `Schema key '${legacy}' must carry a @deprecated description`
        )
      }
    })

    await it('should mark every nested DEPRECATED_KEY_REMAPPINGS entry as @deprecated in the matching sub-schema', () => {
      const subSchemas: Record<string, ZodObjectLike> = {
        worker: WorkerConfigurationSchema,
      }
      for (const legacy of Object.keys(DEPRECATED_KEY_REMAPPINGS)) {
        if (!legacy.includes('.')) {
          continue
        }
        const [section, leaf] = legacy.split('.')
        const subSchema = subSchemas[section]
        assert.notStrictEqual(
          subSchema,
          undefined,
          `No sub-schema registered for section '${section}'; extend subSchemas above`
        )
        const entry = subSchema.shape[leaf]
        assert.notStrictEqual(
          entry,
          undefined,
          `Sub-schema '${section}' is missing nested key '${leaf}'`
        )
        assert.match(
          entry.description ?? '',
          /@deprecated/,
          `Schema key '${section}.${leaf}' must carry a @deprecated description`
        )
      }
    })

    await it('should list every @deprecated top-level schema key in DEPRECATED_KEY_REMAPPINGS', () => {
      const shape = (ConfigurationSchema as unknown as ZodObjectLike).shape
      for (const [fieldName, def] of Object.entries(shape)) {
        if (def.description?.includes('@deprecated') === true) {
          assert.ok(
            fieldName in DEPRECATED_KEY_REMAPPINGS,
            `Schema field '${fieldName}' marked @deprecated but missing from DEPRECATED_KEY_REMAPPINGS`
          )
        }
      }
    })

    await it('should list every @deprecated nested sub-schema key in DEPRECATED_KEY_REMAPPINGS', () => {
      const subSchemas: Record<string, ZodObjectLike> = {
        worker: WorkerConfigurationSchema,
      }
      for (const [section, subSchema] of Object.entries(subSchemas)) {
        for (const [leaf, def] of Object.entries(subSchema.shape)) {
          if (def.description?.includes('@deprecated') === true) {
            const dotted = `${section}.${leaf}`
            assert.ok(
              dotted in DEPRECATED_KEY_REMAPPINGS,
              `Sub-schema field '${dotted}' marked @deprecated but missing from DEPRECATED_KEY_REMAPPINGS`
            )
          }
        }
      }
    })
  })
})
