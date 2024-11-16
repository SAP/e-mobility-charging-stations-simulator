import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  ApplicationProtocolVersion,
  ConfigurationSection,
  SupervisionUrlDistribution,
} from '../../src/types/ConfigurationData.js'

await describe('ConfigurationData test suite', async () => {
  await it('Verify ConfigurationSection enumeration', () => {
    expect(ConfigurationSection.log).toBe('log')
    expect(ConfigurationSection.performanceStorage).toBe('performanceStorage')
    expect(ConfigurationSection.uiServer).toBe('uiServer')
    expect(ConfigurationSection.worker).toBe('worker')
  })

  await it('Verify SupervisionUrlDistribution enumeration', () => {
    expect(SupervisionUrlDistribution.CHARGING_STATION_AFFINITY).toBe('charging-station-affinity')
    expect(SupervisionUrlDistribution.RANDOM).toBe('random')
    expect(SupervisionUrlDistribution.ROUND_ROBIN).toBe('round-robin')
  })

  await it('Verify ApplicationProtocolVersion enumeration', () => {
    expect(ApplicationProtocolVersion.VERSION_11).toBe('1.1')
    expect(ApplicationProtocolVersion.VERSION_20).toBe('2.0')
  })
})
