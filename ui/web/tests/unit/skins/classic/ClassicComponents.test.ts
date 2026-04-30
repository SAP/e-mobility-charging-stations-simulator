/**
 * @file Tests for classic ToggleButton and CSTable components
 * @description Unit tests for classic skin ToggleButton and CSTable components.
 */
import type { ChargingStationData } from 'ui-common'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, shallowRef } from 'vue'

import { chargingStationsKey, configurationKey, templatesKey, uiClientKey } from '@/core'
import ToggleButton from '@/skins/classic/components/buttons/ToggleButton.vue'
import CSTable from '@/skins/classic/components/charging-stations/CSTable.vue'

import { createChargingStationData, createUIServerConfig } from '../../constants.js'
import { ButtonActiveStub, createMockUIClient, type MockUIClient } from '../../helpers.js'

const CSDataStub = defineComponent({
  emits: ['need-refresh'],
  props: { chargingStation: { required: true, type: Object } },
  template: '<tr class="cs-data-stub"><td>stub</td></tr>',
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'charging-stations', params: {}, query: {} }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

let mockClient: MockUIClient

describe('ToggleButton and CSTable', () => {
  describe('ToggleButton', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    /**
     * @param props - ToggleButton props
     * @param props.id - Button identifier
     * @param props.off - Off callback
     * @param props.on - On callback
     * @param props.shared - Whether button is shared
     * @param props.status - Initial status
     * @returns Mounted ToggleButton wrapper
     */
    function mountToggle (props: {
      id: string
      off?: () => void
      on?: () => void
      shared?: boolean
      status?: boolean
    }) {
      return mount(ToggleButton, {
        global: {
          provide: {
            [uiClientKey as symbol]: mockClient,
          },
          stubs: {
            Button: ButtonActiveStub,
          },
        },
        props,
        slots: { default: 'Toggle' },
      })
    }

    it('should render slot content', () => {
      const wrapper = mountToggle({ id: 'test-btn' })
      expect(wrapper.text()).toBe('Toggle')
    })

    it('should initialize status from localStorage when available', () => {
      localStorage.setItem('toggle-button-my-btn', JSON.stringify(true))
      const wrapper = mountToggle({ id: 'my-btn', status: false })
      expect(wrapper.find('.button--active').exists()).toBe(true)
    })

    it('should initialize status from props when localStorage is empty', () => {
      const wrapper = mountToggle({ id: 'fresh-btn', status: false })
      expect(wrapper.find('.button--active').exists()).toBe(false)
    })

    it('should toggle status on click and persist to localStorage', async () => {
      const wrapper = mountToggle({ id: 'click-btn', status: false })
      await wrapper.find('button').trigger('click')
      const stored = localStorage.getItem('toggle-button-click-btn')
      expect(stored != null ? JSON.parse(stored) : null).toBe(true)
      expect(wrapper.find('.button--active').exists()).toBe(true)
    })

    it('should call on callback when toggled to true', async () => {
      const onFn = vi.fn()
      const wrapper = mountToggle({ id: 'on-btn', on: onFn, status: false })
      await wrapper.find('button').trigger('click')
      expect(onFn).toHaveBeenCalledOnce()
    })

    it('should call off callback when toggled to false', async () => {
      localStorage.setItem('toggle-button-off-btn', JSON.stringify(true))
      const offFn = vi.fn()
      const wrapper = mountToggle({ id: 'off-btn', off: offFn, status: true })
      await wrapper.find('button').trigger('click')
      expect(offFn).toHaveBeenCalledOnce()
    })

    it('should emit clicked event with new status', async () => {
      const wrapper = mountToggle({ id: 'emit-btn', status: false })
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('clicked')).toEqual([[true]])
    })

    it('should use shared prefix when shared prop is true', async () => {
      const wrapper = mountToggle({ id: 'shared-btn', shared: true, status: false })
      await wrapper.find('button').trigger('click')
      const stored = localStorage.getItem('shared-toggle-button-shared-btn')
      expect(stored != null ? JSON.parse(stored) : null).toBe(true)
    })

    it('should clear other shared buttons when shared is true', async () => {
      localStorage.setItem('shared-toggle-button-other', JSON.stringify(true))
      const wrapper = mountToggle({ id: 'new-shared', shared: true, status: false })
      await wrapper.find('button').trigger('click')
      const stored = localStorage.getItem('shared-toggle-button-other')
      expect(stored != null ? JSON.parse(stored) : null).toBe(false)
    })

    it('should not clear non-shared buttons when shared is true', async () => {
      localStorage.setItem('toggle-button-regular', JSON.stringify(true))
      const wrapper = mountToggle({ id: 'shared-x', shared: true, status: false })
      await wrapper.find('button').trigger('click')
      const stored = localStorage.getItem('toggle-button-regular')
      expect(stored != null ? JSON.parse(stored) : null).toBe(true)
    })
  })

  describe('CSTable', () => {
    beforeEach(() => {
      mockClient = createMockUIClient()
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    /**
     * @param chargingStations - Station data array
     * @returns Mounted CSTable wrapper
     */
    function mountTable (chargingStations: ChargingStationData[] = []) {
      return mount(CSTable, {
        global: {
          provide: {
            [chargingStationsKey as symbol]: shallowRef(chargingStations),
            [configurationKey as symbol]: shallowRef({ uiServer: [createUIServerConfig()] }),
            [templatesKey as symbol]: shallowRef([]),
            [uiClientKey as symbol]: mockClient,
          },
          stubs: {
            CSData: CSDataStub,
          },
        },
        props: { chargingStations },
      })
    }

    it('should render the table with caption', () => {
      const wrapper = mountTable()
      expect(wrapper.find('.data-table__caption').text()).toBe('Charging Stations')
    })

    it('should render table headers', () => {
      const wrapper = mountTable()
      const headers = wrapper.findAll('th')
      expect(headers.length).toBe(12)
      expect(headers[0].text()).toBe('Name')
      expect(headers[11].text()).toBe('Connector(s)')
    })

    it('should render one CSData per charging station', () => {
      const stations = [
        createChargingStationData(),
        createChargingStationData({
          stationInfo: {
            baseName: 'CS-2',
            chargePointModel: 'Model2',
            chargePointVendor: 'Vendor2',
            chargingStationId: 'CS-2',
            hashId: 'hash-2',
            ocppVersion: undefined as never,
            templateIndex: 1,
            templateName: 'template-2.json',
          },
        }),
      ]
      const wrapper = mountTable(stations)
      expect(wrapper.findAll('.cs-data-stub')).toHaveLength(2)
    })

    it('should render no rows when empty', () => {
      const wrapper = mountTable([])
      expect(wrapper.findAll('.cs-data-stub')).toHaveLength(0)
    })

    it('should emit need-refresh when CSData emits need-refresh', async () => {
      const stations = [createChargingStationData()]
      const wrapper = mountTable(stations)
      const csDataStub = wrapper.findComponent(CSDataStub)
      csDataStub.vm.$emit('need-refresh')
      await flushPromises()
      expect(wrapper.emitted('need-refresh')).toHaveLength(1)
    })
  })
})
