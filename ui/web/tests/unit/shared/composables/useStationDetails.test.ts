/**
 * @file Tests for useStationDetails composable
 * @description Store resolution by hash id and derivation of the read-only detail
 *   sections + OCPP configuration rows shared by both skins.
 */
import { mount } from '@vue/test-utils'
import { type ChargingStationData } from 'ui-common'
import { describe, expect, it } from 'vitest'
import { defineComponent, type Ref, ref } from 'vue'

import { chargingStationsKey } from '@/core/index.js'
import {
  type StationDetailsView,
  useStationDetails,
} from '@/shared/composables/useStationDetails.js'

import { createChargingStationData, TEST_HASH_ID } from '../../constants.js'

/**
 * Mounts a throwaway component that runs useStationDetails with the provided store.
 * @param stations - Reactive charging-station store
 * @param hashId - Hash id to resolve
 * @returns The composable's return value
 */
function runComposable (stations: Ref<ChargingStationData[]>, hashId: string): StationDetailsView {
  let api!: StationDetailsView
  mount(
    defineComponent({
      setup () {
        api = useStationDetails(hashId)
        return () => null
      },
    }),
    { global: { provide: { [chargingStationsKey as symbol]: stations } } }
  )
  return api
}

describe('useStationDetails', () => {
  it('should resolve the station and derive its sections and configuration rows', () => {
    const stations = ref([
      createChargingStationData({
        ocppConfiguration: {
          configurationKey: [{ key: 'HeartbeatInterval', readonly: false, value: '30' }],
        },
      }),
    ])
    const { configurationRows, sections, station } = runComposable(stations, TEST_HASH_ID)
    expect(station.value?.stationInfo.hashId).toBe(TEST_HASH_ID)
    expect(sections.value.map(section => section.title)).toContain('General')
    expect(configurationRows.value).toEqual([
      { key: 'HeartbeatInterval', readonly: 'No', reboot: 'No', value: '30' },
    ])
  })

  it('should expose the visible raw configuration keys', () => {
    const stations = ref([
      createChargingStationData({
        ocppConfiguration: {
          configurationKey: [
            { key: 'HeartbeatInterval', readonly: false, value: '30' },
            { key: 'SecretKey', readonly: true, value: 'x', visible: false },
          ],
        },
      }),
    ])
    const { visibleConfigurationKeys } = runComposable(stations, TEST_HASH_ID)
    expect(visibleConfigurationKeys.value).toEqual([
      { key: 'HeartbeatInterval', readonly: false, value: '30' },
    ])
  })

  it('should return an undefined station and empty derived data for an unknown hashId', () => {
    const stations = ref([createChargingStationData()])
    const { configurationRows, sections, station } = runComposable(stations, 'unknown-hash')
    expect(station.value).toBeUndefined()
    expect(sections.value).toEqual([])
    expect(configurationRows.value).toEqual([])
  })

  it('should reactively resolve a station added to the store after mount', () => {
    const stations = ref<ChargingStationData[]>([])
    const { sections, station } = runComposable(stations, TEST_HASH_ID)
    expect(station.value).toBeUndefined()
    stations.value = [createChargingStationData()]
    expect(station.value?.stationInfo.hashId).toBe(TEST_HASH_ID)
    expect(sections.value.map(section => section.title)).toContain('General')
  })
})
