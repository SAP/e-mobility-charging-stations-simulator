/**
 * @file Tests that a non-persistent charging station owns an independent OCPP Configuration.
 * @description getOcppConfigurationFromTemplate() must clone the cached template's
 * Configuration so a runtime configuration-key change on a non-persistent station stays
 * local and does not mutate the shared template held in the SharedLRUCache.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type { ChargingStationTemplate } from '../../src/types/index.js'

import {
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../../src/charging-station/ConfigurationKeyUtils.js'
import { SharedLRUCache } from '../../src/charging-station/SharedLRUCache.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

// templateFileHash is the SharedLRUCache key; reached via a typed boundary cast (no `as any`).
const templateHashOf = (station: ChargingStation): string =>
  (station as unknown as { templateFileHash: string }).templateFileHash

const configValue = (template: ChargingStationTemplate, key: string): string | undefined =>
  template.Configuration?.configurationKey?.find(configKey => configKey.key === key)?.value

// A pre-existing, mutable key shipped by the virtual-simple template.
const CONFIG_KEY = 'MeterValueSampleInterval'
const TEMPLATE_VALUE = '30'

await describe('ChargingStation OCPP Configuration isolation', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupStationTemplates()
  })

  await it('should not mutate the shared cached template when a non-persistent station changes a configuration key', () => {
    const templateFile = copyStationTemplate()
    const station = createStationFromTemplate(templateFile, { persistentConfiguration: false })

    // The exact cached template the station parsed and read its Configuration from.
    const cachedTemplate = SharedLRUCache.getInstance().getChargingStationTemplate(
      templateHashOf(station)
    )
    assert.strictEqual(configValue(cachedTemplate, CONFIG_KEY), TEMPLATE_VALUE)

    // A non-persistent station must own an independent copy, not the cached template's array.
    // Assert both operands are present first so the reference check cannot pass vacuously.
    assert.ok(
      station.ocppConfiguration?.configurationKey != null,
      'station ocppConfiguration must be initialized'
    )
    assert.ok(
      cachedTemplate.Configuration?.configurationKey != null,
      'cached template Configuration must be present'
    )
    assert.notStrictEqual(
      station.ocppConfiguration.configurationKey,
      cachedTemplate.Configuration.configurationKey
    )

    setConfigurationKeyValue(station, CONFIG_KEY, '999')

    assert.strictEqual(getConfigurationKey(station, CONFIG_KEY)?.value, '999')
    // The shared cached template is untouched.
    assert.strictEqual(configValue(cachedTemplate, CONFIG_KEY), TEMPLATE_VALUE)
  })
})
