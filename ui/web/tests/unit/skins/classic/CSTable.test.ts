/**
 * @file Tests for CSTable
 * @description Verifies table rendering and delegation to CSData rows.
 */
import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uiClientKey } from '@/composables'
import CSTable from '@/skins/classic/components/charging-stations/CSTable.vue'

import { createChargingStationData } from '../../constants.js'
import { createMockUIClient, type MockUIClient } from '../../helpers.js'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'charging-stations', params: {}, query: {} }),
  useRouter: () => ({
    push: mockPush,
  }),
}))

let mockClient: MockUIClient

describe('CSTable', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render one CSData component per station', () => {
    const stations = [
      createChargingStationData(),
      createChargingStationData({
        stationInfo: {
          baseName: 'CS-2',
          chargePointModel: 'M2',
          chargePointVendor: 'V2',
          chargingStationId: 'CS-002',
          hashId: 'hash-2',
          templateIndex: 1,
          templateName: 'tpl2.json',
        },
      }),
    ]
    const wrapper = shallowMount(CSTable, {
      global: {
        mocks: { $router: { push: mockPush } },
        provide: { [uiClientKey as symbol]: mockClient },
      },
      props: { chargingStations: stations },
    })
    const csDataComponents = wrapper.findAllComponents({ name: 'CSData' })
    expect(csDataComponents).toHaveLength(2)
  })

  it('should render no rows when stations array is empty', () => {
    const wrapper = shallowMount(CSTable, {
      global: {
        mocks: { $router: { push: mockPush } },
        provide: { [uiClientKey as symbol]: mockClient },
      },
      props: { chargingStations: [] },
    })
    const csDataComponents = wrapper.findAllComponents({ name: 'CSData' })
    expect(csDataComponents).toHaveLength(0)
  })

  it('should propagate need-refresh event from CSData', () => {
    const wrapper = shallowMount(CSTable, {
      global: {
        mocks: { $router: { push: mockPush } },
        provide: { [uiClientKey as symbol]: mockClient },
      },
      props: { chargingStations: [createChargingStationData()] },
    })
    const csData = wrapper.findComponent({ name: 'CSData' })
    ;(csData.vm as unknown as { $emit: (event: string) => void }).$emit('need-refresh')
    expect(wrapper.emitted('need-refresh')).toHaveLength(1)
  })
})
