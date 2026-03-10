/**
 * @file Tests for ConfigurationData
 * @description Unit tests for configuration data types and enumerations
 */
import assert from 'node:assert/strict'
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
    assert.strictEqual(ConfigurationSection.log, 'log')
    assert.strictEqual(ConfigurationSection.performanceStorage, 'performanceStorage')
    assert.strictEqual(ConfigurationSection.uiServer, 'uiServer')
    assert.strictEqual(ConfigurationSection.worker, 'worker')
  })

  await it('should define SupervisionUrlDistribution enumeration values', () => {
    assert.strictEqual(
      SupervisionUrlDistribution.CHARGING_STATION_AFFINITY,
      'charging-station-affinity'
    )
    assert.strictEqual(SupervisionUrlDistribution.RANDOM, 'random')
    assert.strictEqual(SupervisionUrlDistribution.ROUND_ROBIN, 'round-robin')
  })

  await it('should define ApplicationProtocolVersion enumeration values', () => {
    assert.strictEqual(ApplicationProtocolVersion.VERSION_11, '1.1')
    assert.strictEqual(ApplicationProtocolVersion.VERSION_20, '2.0')
  })
})
