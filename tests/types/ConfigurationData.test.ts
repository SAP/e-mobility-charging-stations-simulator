/**
 * @file Tests for ConfigurationData
 * @description Unit tests for configuration data types and enumerations
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import {
  ApplicationProtocolVersion,
  ConfigurationSection,
  SupervisionUrlDistribution,
} from '../../src/types/ConfigurationData.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('ConfigurationData', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should define ConfigurationSection enumeration values', () => {
    expect(ConfigurationSection.log).toBe('log')
    expect(ConfigurationSection.performanceStorage).toBe('performanceStorage')
    expect(ConfigurationSection.uiServer).toBe('uiServer')
    expect(ConfigurationSection.worker).toBe('worker')
  })

  await it('should define SupervisionUrlDistribution enumeration values', () => {
    expect(SupervisionUrlDistribution.CHARGING_STATION_AFFINITY).toBe('charging-station-affinity')
    expect(SupervisionUrlDistribution.RANDOM).toBe('random')
    expect(SupervisionUrlDistribution.ROUND_ROBIN).toBe('round-robin')
  })

  await it('should define ApplicationProtocolVersion enumeration values', () => {
    expect(ApplicationProtocolVersion.VERSION_11).toBe('1.1')
    expect(ApplicationProtocolVersion.VERSION_20).toBe('2.0')
  })
})
