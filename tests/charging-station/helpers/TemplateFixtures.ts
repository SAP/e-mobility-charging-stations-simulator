/**
 * @file Shared template fixtures for schema/migration/validation tests.
 */

import { CURRENT_SCHEMA_VERSION } from '../../../src/charging-station/TemplateMigrations.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_BASE_NAME,
} from '../ChargingStationTestConstants.js'

/**
 * Build a minimal valid template at the current schema version.
 * @param overrides - Fields to merge into the base template
 * @returns A minimal template accepted by `TemplateSchema`
 */
export const buildMinimalTemplate = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  $schemaVersion: CURRENT_SCHEMA_VERSION,
  baseName: TEST_CHARGING_STATION_BASE_NAME,
  chargePointModel: TEST_CHARGE_POINT_MODEL,
  chargePointVendor: TEST_CHARGE_POINT_VENDOR,
  ...overrides,
})

/**
 * Build a minimal pre-current-version template for migration-path tests.
 * @param overrides - Fields to merge into the base template
 * @returns A minimal template without `$schemaVersion`
 */
export const buildLegacyTemplate = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  baseName: TEST_CHARGING_STATION_BASE_NAME,
  chargePointModel: TEST_CHARGE_POINT_MODEL,
  chargePointVendor: TEST_CHARGE_POINT_VENDOR,
  ...overrides,
})
