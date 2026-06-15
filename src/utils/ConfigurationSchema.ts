import type { ListenOptions } from 'node:net'
import type { ResourceLimits } from 'node:worker_threads'

import { isIP } from 'node:net'
import { z } from 'zod'

import { isHostLiteralWithoutPort } from '../charging-station/ui-server/UIServerNet.js'
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  AuthenticationType,
  StorageType,
  SupervisionUrlDistribution,
} from '../types/index.js'
import { WorkerProcessType } from '../worker/index.js'
import { CURRENT_CONFIGURATION_SCHEMA_VERSION } from './ConfigurationMigrations.js'

// ---------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------

/**
 * LogConfiguration — winston logger configuration section.
 * `maxFiles` and `maxSize` accept `number | string` (winston-daily-rotate-file
 * units like '14d', '20m').
 */
export const LogConfigurationSchema = z
  .object({
    console: z.boolean().optional(),
    enabled: z.boolean().optional(),
    errorFile: z.string().optional(),
    file: z.string().optional(),
    format: z.string().optional(),
    level: z
      .enum(['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'])
      .optional(),
    maxFiles: z.union([z.number(), z.string()]).optional(),
    maxSize: z.union([z.number(), z.string()]).optional(),
    rotate: z.boolean().optional(),
    statisticsInterval: z.number().int().nonnegative().optional(),
  })
  .strict()

/**
 * WorkerConfiguration — worker threads configuration section.
 * `resourceLimits` is bridged via `z.custom<ResourceLimits>()`;
 * `elementStartDelay` is preserved as deprecated alias for `elementAddDelay`.
 */
export const WorkerConfigurationSchema = z
  .object({
    elementAddDelay: z.number().int().nonnegative().optional(),
    elementsPerWorker: z
      .union([z.literal('auto'), z.literal('all'), z.number().int().positive()])
      .optional(),
    elementStartDelay: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("@deprecated: use 'elementAddDelay' instead"),
    poolMaxSize: z.number().int().positive().optional(),
    poolMinSize: z.number().int().positive().optional(),
    processType: z.enum(WorkerProcessType).optional(),
    resourceLimits: z.custom<ResourceLimits>().optional(),
    startDelay: z.number().int().nonnegative().optional(),
  })
  .strict()

/**
 * StorageConfiguration — performance storage configuration section.
 * Legacy `URI` (uppercase) is accepted but not auto-migrated; canonical key is `uri`.
 */
export const StorageConfigurationSchema = z
  .object({
    enabled: z.boolean().optional(),
    type: z.enum(StorageType).optional(),
    uri: z.string().optional(),
    URI: z.string().optional().describe("@deprecated: use 'uri' instead"),
  })
  .strict()

/**
 * UIServerAuthentication — credentials for the UI server.
 * `enabled` and `type` are required; `username`/`password` are optional and
 * depend on the chosen authentication scheme.
 */
export const UIServerAuthenticationSchema = z
  .object({
    enabled: z.boolean(),
    password: z.string().optional(),
    type: z.enum(AuthenticationType),
    username: z.string().optional(),
  })
  .strict()

export const UI_SERVER_ACCESS_POLICY_DEFAULTS = {
  allowedHosts: [],
  allowedOrigins: [],
  allowLoopbackProxy: false,
  requireTlsForNonLoopback: true,
  trustedProxies: [],
} as const

export const UIServerAccessPolicySchema = z
  .object({
    allowedHosts: z
      .array(
        z.string().refine(isHostLiteralWithoutPort, {
          message: 'must be a host literal without port (no path, query, or fragment)',
        })
      )
      .optional(),
    allowedOrigins: z
      .array(
        z.url().refine(
          value => {
            const url = new URL(value)
            return (
              (url.pathname === '/' || url.pathname === '') && url.search === '' && url.hash === ''
            )
          },
          {
            message:
              'must be an origin URL without path, query, or fragment (e.g. https://example.com)',
          }
        )
      )
      .optional(),
    allowLoopbackProxy: z.boolean().optional(),
    requireTlsForNonLoopback: z.boolean().optional(),
    trustedProxies: z
      .array(
        z.string().refine(value => isIP(value) !== 0, {
          message:
            'must be an IPv4 or IPv6 literal (hostnames, brackets, and CIDR ranges are not supported)',
        })
      )
      .optional(),
  })
  .strict()

/**
 * UIServerListenOptionsObjectSchema — typed object layer for `node:net`
 * `ListenOptions`. Validates known primitive fields (port, host, backlog, ...)
 * at boot time so that bad transport-level values (e.g. `port: "not-a-number"`)
 * fail in `ConfigurationSchema.safeParse` rather than later in `Server.listen`.
 * Unknown keys are passed through (`.loose()`) to preserve the `ListenOptions`
 * extension surface (e.g. `signal: AbortSignal`).
 */
const UIServerListenOptionsObjectSchema = z
  .object({
    backlog: z.number().int().nonnegative().optional(),
    exclusive: z.boolean().optional(),
    host: z.string().min(1).optional(),
    ipv6Only: z.boolean().optional(),
    path: z.string().min(1).optional(),
    port: z.number().int().min(0).max(65535).optional(),
    readableAll: z.boolean().optional(),
    writableAll: z.boolean().optional(),
  })
  .loose()

/**
 * UIServerListenOptionsSchema — composite schema for `uiServer.options`:
 * non-array object guard → `accessPolicy` misplacement refinement → typed
 * field validation via `UIServerListenOptionsObjectSchema`.
 */
const UIServerListenOptionsSchema = z
  .custom<ListenOptions>(
    value => value != null && typeof value === 'object' && !Array.isArray(value),
    { message: 'must be a non-array object' }
  )
  .refine(value => !Object.hasOwn(value as object, 'accessPolicy'), {
    message: "'accessPolicy' must be configured under 'uiServer', not 'uiServer.options'",
  })
  .pipe(UIServerListenOptionsObjectSchema)

/**
 * UIServerConfiguration — UI server configuration section.
 * `options` is structurally typed as `ListenOptions` from node:net and
 * validated by `UIServerListenOptionsSchema` (object guard → `accessPolicy`
 * refinement → typed field validation).
 */
export const UIServerConfigurationSchema = z
  .object({
    accessPolicy: UIServerAccessPolicySchema.optional(),
    authentication: UIServerAuthenticationSchema.optional(),
    enabled: z.boolean().optional(),
    options: UIServerListenOptionsSchema.optional(),
    type: z.enum(ApplicationProtocol).optional(),
    version: z.enum(ApplicationProtocolVersion).optional(),
  })
  .strict()

/**
 * StationTemplateUrl — entry of the `stationTemplateUrls` array.
 * Legacy `numberOfStation` (singular) is accepted but not auto-migrated;
 * canonical key is `numberOfStations`.
 */
export const StationTemplateUrlSchema = z
  .object({
    file: z.string().min(1),
    numberOfStation: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("@deprecated: use 'numberOfStations' instead"),
    numberOfStations: z.number().int().nonnegative(),
    provisionedNumberOfStations: z.number().int().nonnegative().optional(),
  })
  .strict()

// ---------------------------------------------------------------
// Top-level configuration schema
// ---------------------------------------------------------------

/**
 * ConfigurationSchema — strict schema for the simulator configuration.
 * Top-level and all sub-sections reject unknown keys (typos must fail at boot).
 *
 * Deprecated top-level keys are accepted as `.optional()` with a `.describe()`
 * marker so existing user configurations continue to parse while
 * `remapDeprecatedKeys` emits warnings and remaps them to canonical keys.
 *
 * The `@deprecated:` describe markers are kept in sync with
 * `DEPRECATED_KEY_REMAPPINGS` (single source of truth) by a meta-test covering
 * top-level and `worker.*` keys.
 */
export const ConfigurationSchema = z
  .object({
    $schemaVersion: z.literal(CURRENT_CONFIGURATION_SCHEMA_VERSION),
    autoReconnectMaxRetries: z
      .number()
      .optional()
      .describe('@deprecated: moved to charging station template'),
    chargingStationsPerWorker: z
      .number()
      .optional()
      .describe("@deprecated: use 'worker.elementsPerWorker' instead"),
    distributeStationsToTenantsEqually: z
      .boolean()
      .optional()
      .describe("@deprecated: use 'supervisionUrlDistribution' instead"),
    distributeStationToTenantEqually: z
      .boolean()
      .optional()
      .describe("@deprecated: use 'supervisionUrlDistribution' instead"),
    elementAddDelay: z
      .number()
      .optional()
      .describe("@deprecated: use 'worker.elementAddDelay' instead"),
    log: LogConfigurationSchema.optional(),
    logConsole: z.boolean().optional().describe("@deprecated: use 'log.console' instead"),
    logEnabled: z.boolean().optional().describe("@deprecated: use 'log.enabled' instead"),
    logErrorFile: z.string().optional().describe("@deprecated: use 'log.errorFile' instead"),
    logFile: z.string().optional().describe("@deprecated: use 'log.file' instead"),
    logFormat: z.string().optional().describe("@deprecated: use 'log.format' instead"),
    logLevel: z.string().optional().describe("@deprecated: use 'log.level' instead"),
    logMaxFiles: z
      .union([z.number(), z.string()])
      .optional()
      .describe("@deprecated: use 'log.maxFiles' instead"),
    logMaxSize: z
      .union([z.number(), z.string()])
      .optional()
      .describe("@deprecated: use 'log.maxSize' instead"),
    logRotate: z.boolean().optional().describe("@deprecated: use 'log.rotate' instead"),
    logStatisticsInterval: z
      .number()
      .optional()
      .describe("@deprecated: use 'log.statisticsInterval' instead"),
    performanceStorage: StorageConfigurationSchema.optional(),
    persistState: z.boolean().optional(),
    stationTemplateURLs: z
      .array(z.unknown())
      .optional()
      .describe("@deprecated: use 'stationTemplateUrls' instead"),
    stationTemplateUrls: z.array(StationTemplateUrlSchema).min(1),
    supervisionUrlDistribution: z.enum(SupervisionUrlDistribution).optional(),
    supervisionURLs: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("@deprecated: use 'supervisionUrls' instead"),
    supervisionUrls: z.union([z.string(), z.array(z.string())]).optional(),
    uiServer: UIServerConfigurationSchema.optional(),
    uiWebSocketServer: z.unknown().optional().describe("@deprecated: use 'uiServer' instead"),
    useWorkerPool: z.boolean().optional().describe("@deprecated: use 'worker.processType' instead"),
    worker: WorkerConfigurationSchema.optional(),
    workerPoolMaxSize: z
      .number()
      .optional()
      .describe("@deprecated: use 'worker.poolMaxSize' instead"),
    workerPoolMinSize: z
      .number()
      .optional()
      .describe("@deprecated: use 'worker.poolMinSize' instead"),
    workerPoolSize: z.number().optional().describe("@deprecated: use 'worker.poolMaxSize' instead"),
    workerPoolStrategy: z
      .string()
      .optional()
      .describe("@deprecated: use 'worker' configuration section instead"),
    workerProcess: z.string().optional().describe("@deprecated: use 'worker.processType' instead"),
    workerStartDelay: z
      .number()
      .optional()
      .describe("@deprecated: use 'worker.startDelay' instead"),
  })
  .strict()
