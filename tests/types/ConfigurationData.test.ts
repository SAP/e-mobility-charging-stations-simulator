import { describe, it } from 'node:test'

import { expect } from 'expect'

import {
  ApplicationProtocolVersion,
  ConfigurationSection,
  SupervisionUrlDistribution,
} from '../../src/types/ConfigurationData.js'

await describe('ConfigurationData test suite', async () => {
  await it('Verify ConfigurationSection enumeration', () => {
    expect(ConfigurationSection.log).toBe('log')
    expect(ConfigurationSection.performanceStorage).toBe('performanceStorage')
    expect(ConfigurationSection.worker).toBe('worker')
    expect(ConfigurationSection.uiServer).toBe('uiServer')
  })

  await it('Verify SupervisionUrlDistribution enumeration', () => {
    expect(SupervisionUrlDistribution.ROUND_ROBIN).toBe('round-robin')
    expect(SupervisionUrlDistribution.RANDOM).toBe('random')
    expect(SupervisionUrlDistribution.CHARGING_STATION_AFFINITY).toBe('charging-station-affinity')
  })

  await it('Verify ApplicationProtocolVersion enumeration', () => {
    expect(ApplicationProtocolVersion.VERSION_11).toBe('1.1')
    expect(ApplicationProtocolVersion.VERSION_20).toBe('2.0')
  })
})
