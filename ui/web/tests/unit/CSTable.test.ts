/**
 * @file Tests for CSTable component
 * @description Unit tests for charging station table column headers and row rendering.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ChargingStationData } from '@/types/ChargingStationType'

import CSTable from '@/components/charging-stations/CSTable.vue'

import { createChargingStationData, createStationInfo } from './constants'

/**
 * Mounts CSTable with CSData stubbed out.
 * @param chargingStations - Array of charging stations
 * @returns Mounted component wrapper
 */
function mountCSTable (chargingStations: ChargingStationData[] = []) {
  return mount(CSTable, {
    global: { stubs: { CSData: true } },
    props: { chargingStations },
  })
}

describe('CSTable', () => {
  describe('column headers', () => {
    it('should render all column headers', () => {
      const wrapper = mountCSTable()
      const text = wrapper.text()
      expect(text).toContain('Name')
      expect(text).toContain('Started')
      expect(text).toContain('Supervision Url')
      expect(text).toContain('WebSocket State')
      expect(text).toContain('Registration Status')
      expect(text).toContain('OCPP Version')
      expect(text).toContain('Template')
      expect(text).toContain('Vendor')
      expect(text).toContain('Model')
      expect(text).toContain('Firmware')
      expect(text).toContain('Actions')
      expect(text).toContain('Connector(s)')
    })

    it('should render table caption', () => {
      const wrapper = mountCSTable()
      expect(wrapper.text()).toContain('Charging Stations')
    })
  })

  describe('row rendering', () => {
    it('should render a CSData row for each charging station', () => {
      const stations = [
        createChargingStationData(),
        createChargingStationData({
          stationInfo: createStationInfo({ chargingStationId: 'CS-002', hashId: 'hash-2' }),
        }),
      ]
      const wrapper = mountCSTable(stations)
      expect(wrapper.findAllComponents({ name: 'CSData' })).toHaveLength(2)
    })

    it('should handle empty charging stations array', () => {
      const wrapper = mountCSTable([])
      expect(wrapper.findAllComponents({ name: 'CSData' })).toHaveLength(0)
    })

    it('should propagate need-refresh event from CSData', async () => {
      const stations = [createChargingStationData()]
      const CSDataStub = {
        emits: ['need-refresh'],
        template: '<tr></tr>',
      }
      const wrapper = mount(CSTable, {
        global: { stubs: { CSData: CSDataStub } },
        props: { chargingStations: stations },
      })
      const csDataComponent = wrapper.findComponent(CSDataStub)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await csDataComponent.vm.$emit('need-refresh')
      expect(wrapper.emitted('need-refresh')).toHaveLength(1)
    })
  })
})
