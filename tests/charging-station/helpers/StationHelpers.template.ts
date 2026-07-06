/**
 * @file Mock ChargingStationTemplate factory for testing.
 */

import type { ChargingStationTemplate } from '../../../src/types/index.js'

import { TEST_CHARGING_STATION_BASE_NAME } from '../ChargingStationTestConstants.js'

/**
 * Create a mock charging station template for testing
 * @param baseName - Base name for the template
 * @returns ChargingStationTemplate with minimal required properties for testing
 */
export function createMockChargingStationTemplate (
  baseName: string = TEST_CHARGING_STATION_BASE_NAME
): ChargingStationTemplate {
  return {
    baseName,
  } as ChargingStationTemplate
}
