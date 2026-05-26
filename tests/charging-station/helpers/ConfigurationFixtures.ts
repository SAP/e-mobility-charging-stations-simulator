/**
 * @file Shared configuration fixtures for schema/migration/validation tests.
 */

import { CURRENT_CONFIGURATION_SCHEMA_VERSION } from '../../../src/charging-station/ConfigurationMigrations.js'

/**
 * Build a minimal valid configuration at the current schema version.
 * @param overrides - Fields to merge into the base configuration
 * @returns A minimal configuration accepted by `ConfigurationSchema`
 */
export const buildMinimalConfiguration = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION,
  stationTemplateUrls: [{ file: 'minimal.station-template.json', numberOfStations: 1 }],
  ...overrides,
})

/**
 * Build a legacy (v0) configuration without `$schemaVersion` for migration-path tests.
 * Uses deprecated top-level keys that were moved to sub-sections.
 * @param overrides - Fields to merge into the base configuration
 * @returns A configuration without `$schemaVersion` (pre-versioning / v0)
 */
export const buildLegacyConfiguration = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  logEnabled: true,
  stationTemplateURLs: [{ file: 'legacy.json', numberOfStations: 1 }],
  workerProcess: 'workerSet',
  ...overrides,
})

/**
 * Build a fully-populated configuration with every section set to valid values.
 * Suitable for round-trip serialization and schema completeness tests.
 * @returns A fully-populated configuration at the current schema version
 */
export const buildFullConfiguration = (): Record<string, unknown> => ({
  $schemaVersion: CURRENT_CONFIGURATION_SCHEMA_VERSION,
  log: {
    console: false,
    enabled: true,
    errorFile: 'logs/error.log',
    file: 'logs/combined.log',
    format: 'simple',
    level: 'info',
    maxFiles: 7,
    maxSize: '10m',
    rotate: true,
    statisticsInterval: 60,
  },
  performanceStorage: {
    enabled: true,
    type: 'none',
  },
  persistState: false,
  stationTemplateUrls: [
    { file: 'full.station-template.json', numberOfStations: 2, provisionedNumberOfStations: 4 },
  ],
  supervisionUrlDistribution: 'charging-station-affinity',
  supervisionUrls: ['ws://localhost:8080/ocpp'],
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
})

/**
 * Parametric negative-test fixtures: `[label, value, expectedErrorPath]`.
 * Each entry is expected to fail `ConfigurationSchema.safeParse(value)`.
 * `expectedErrorPath` is the dot-separated Zod error path (empty string means
 * the error is at the root / unknown-key level).
 */
export const BAD_FIXTURES: [label: string, value: unknown, expectedErrorPath: string][] = [
  ['missing stationTemplateUrls', { $schemaVersion: 1 }, 'stationTemplateUrls'],
  [
    'empty stationTemplateUrls',
    { $schemaVersion: 1, stationTemplateUrls: [] },
    'stationTemplateUrls',
  ],
  [
    'missing $schemaVersion',
    { stationTemplateUrls: [{ file: 'a.json', numberOfStations: 1 }] },
    '$schemaVersion',
  ],
  [
    'wrong type for stationTemplateUrls',
    { $schemaVersion: 1, stationTemplateUrls: 'not-array' },
    'stationTemplateUrls',
  ],
  [
    'unknown top-level key',
    {
      $schemaVersion: 1,
      bogusKey: 42,
      stationTemplateUrls: [{ file: 'a.json', numberOfStations: 1 }],
    },
    '',
  ],
  [
    'invalid worker.processType',
    {
      $schemaVersion: 1,
      stationTemplateUrls: [{ file: 'a.json', numberOfStations: 1 }],
      worker: { processType: 'invalid' },
    },
    'worker.processType',
  ],
]
