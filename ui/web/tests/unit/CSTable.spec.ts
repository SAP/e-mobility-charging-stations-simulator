import { shallowMount } from '@vue/test-utils'
import { expect, test } from 'vitest'

import CSTable from '@/components/charging-stations/CSTable.vue'
import type { ChargingStationData } from '@/types'

test('renders CS table columns name', () => {
  const chargingStations: ChargingStationData[] = []
  const wrapper = shallowMount(CSTable, {
    props: { chargingStations, idTag: '0' }
  })
  expect(wrapper.text()).to.include('Name')
  expect(wrapper.text()).to.include('Started')
  expect(wrapper.text()).to.include('Supervision Url')
  expect(wrapper.text()).to.include('WebSocket State')
  expect(wrapper.text()).to.include('Registration Status')
  expect(wrapper.text()).to.include('Template')
  expect(wrapper.text()).to.include('Vendor')
  expect(wrapper.text()).to.include('Model')
  expect(wrapper.text()).to.include('Firmware')
  expect(wrapper.text()).to.include('Actions')
  expect(wrapper.text()).to.include('Connector(s)')
})
