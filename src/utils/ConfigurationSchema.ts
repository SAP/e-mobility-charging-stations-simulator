import type { ListenOptions } from 'node:net'
import type { ResourceLimits } from 'node:worker_threads'

import { isIP } from 'node:net'
import { z } from 'zod'

import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  AuthenticationType,
  StorageType,
  SupervisionUrlDistribution,
} from '../types/index.js'
import { WorkerProcessType } from '../worker/index.js'
import { CURRENT_CONFIGURATION_SCHEMA_VERSION } from './ConfigurationMigrations.js'
import { isHostLiteralWithoutPort } from './HostUtils.js'
import { has } from './Utils.js'

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
 * UIServerAuthentication — credentials for the UI server. `username` is a
 * non-empty string without `':'` (RFC 7617); `password` is a non-empty
 * string. Both are required when `enabled` is true. Field-level constraints
 * fire unconditionally — intentionally stricter than the runtime guard in
 * `UIServerFactory` so empty placeholders cannot ship under `enabled: false`
 * and become a Basic-Auth bypass on the next boot with `enabled: true`.
 */
export const UIServerAuthenticationSchema = z
  .object({
    enabled: z.boolean(),
    password: z.string().min(1).optional(),
    type: z.enum(AuthenticationType),
    username: z
      .string()
      .min(1)
      .refine(value => !value.includes(':'), {
        message: "must not contain ':' (RFC 7617)",
      })
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) return
    if (value.username == null) {
      ctx.addIssue({
        code: 'custom',
        message: "'username' is required when 'authentication.enabled' is true",
        path: ['username'],
      })
    }
    if (value.password == null) {
      ctx.addIssue({
        code: 'custom',
        message: "'password' is required when 'authentication.enabled' is true",
        path: ['password'],
      })
    }
  })

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
  .refine(
    value =>
      !(
        value.allowLoopbackProxy === true &&
        (value.trustedProxies == null || value.trustedProxies.length === 0)
      ),
    {
      message: "'allowLoopbackProxy' requires at least one entry in 'trustedProxies'",
      path: ['trustedProxies'],
    }
  )

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
  .refine(value => !has('accessPolicy', value), {
    message: "'accessPolicy' must be configured under 'uiServer', not 'uiServer.options'",
  })
  .pipe(UIServerListenOptionsObjectSchema)

/**
 * UIServerMetricsConfiguration — opt-in Prometheus /metrics endpoint
 * served by every UI transport (`http`, `ws`, `mcp`). On `ws` and `mcp`
 * the endpoint co-mounts on the same listener as the primary transport
 * (the underlying `Http2Server | Server` allocated by `AbstractUIServer`)
 * and inherits its `accessPolicy`, rate-limit, and `authentication`
 * (issue #1917).
 *
 * `softSampleCap` (optional, default `METRICS_SOFT_SAMPLE_CAP` = 5000)
 * is the soft cardinality cap above which a single `logger.warn` is
 * emitted per scrape; the response is still served in full.
 */
export const UIServerMetricsConfigurationSchema = z
  .object({
    enabled: z.boolean().optional(),
    softSampleCap: z.number().int().positive().optional(),
  })
  .strict()

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
    metrics: UIServerMetricsConfigurationSchema.optional(),
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
