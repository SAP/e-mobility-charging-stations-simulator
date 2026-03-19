/**
 * @file Tests for CSData component
 * @description Unit tests for charging station row display, actions, and connector entry generation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UIClient } from '@/composables/UIClient'
import type { ChargingStationData } from '@/types'

import CSConnector from '@/components/charging-stations/CSConnector.vue'
import CSData from '@/components/charging-stations/CSData.vue'
import { useUIClient } from '@/composables'
import { OCPPVersion } from '@/types'

import { toastMock } from '../setup'
import {
  createChargingStationData,
  createConnectorStatus,
  createEvseEntry,
  createStationInfo,
} from './constants'
import { ButtonStub, createMockUIClient, type MockUIClient } from './helpers'

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return { ...(actual as Record<string, unknown>), useUIClient: vi.fn() }
})

/**
 * Mounts CSData with mock UIClient and stubbed child components.
 * @param chargingStation - Charging station data
 * @returns Mounted component wrapper
 */
function mountCSData (chargingStation: ChargingStationData = createChargingStationData()) {
  return mount(CSData, {
    global: {
      stubs: {
        Button: ButtonStub,
        CSConnector: true,
        ToggleButton: true,
      },
    },
    props: { chargingStation },
  })
}

describe('CSData', () => {
  let mockClient: MockUIClient

  beforeEach(() => {
    mockClient = createMockUIClient()
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as UIClient)
  })

  describe('station info display', () => {
    it('should display charging station ID', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('CS-TEST-001')
    })

    it('should display started status as Yes when started', () => {
      const wrapper = mountCSData(createChargingStationData({ started: true }))
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('Yes')
    })

    it('should display started status as No when not started', () => {
      const wrapper = mountCSData(createChargingStationData({ started: false }))
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('No')
    })

    it('should display template name', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('template-test.json')
    })

    it('should display vendor and model', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('TestVendor')
      expect(wrapper.text()).toContain('TestModel')
    })

    it('should display firmware version', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('1.0.0')
    })

    it('should display Ø when firmware version is missing', () => {
      const station = createChargingStationData({
        stationInfo: createStationInfo({ firmwareVersion: undefined }),
      })
      const wrapper = mountCSData(station)
      const cells = wrapper.findAll('td')
      expect(cells[8].text()).toBe('Ø')
    })

    it('should display WebSocket state as Open when OPEN', () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: WebSocket.OPEN }))
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('Open')
    })

    it('should display WebSocket state as Closed when CLOSED', () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: WebSocket.CLOSED }))
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('Closed')
    })

    it('should display WebSocket state as Ø for undefined state', () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: undefined }))
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('Ø')
    })

    it('should display registration status', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('Accepted')
    })

    it('should display Ø when no boot notification response', () => {
      const station = createChargingStationData({ bootNotificationResponse: undefined })
      const wrapper = mountCSData(station)
      const cells = wrapper.findAll('td')
      expect(cells[4].text()).toBe('Ø')
    })
  })

  describe('supervision URL display', () => {
    it('should format supervision URL without path', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('ws://')
      expect(wrapper.text()).toContain('supervisor')
    })

    it('should insert zero-width space after dots in host', () => {
      const station = createChargingStationData({
        supervisionUrl: 'ws://my.host.example.com:9000/path',
      })
      const wrapper = mountCSData(station)
      const cells = wrapper.findAll('td')
      const supervisionText = cells[2].text()
      expect(supervisionText).toContain('\u200b')
    })
  })

  describe('station actions', () => {
    it('should call startChargingStation on button click', async () => {
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const startBtn = buttons.find(b => b.text() === 'Start Charging Station')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.startChargingStation).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call stopChargingStation on button click', async () => {
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const stopBtn = buttons.find(b => b.text() === 'Stop Charging Station')
      await stopBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.stopChargingStation).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call openConnection on button click', async () => {
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const openBtn = buttons.find(b => b.text() === 'Open Connection')
      await openBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.openConnection).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call closeConnection on button click', async () => {
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const closeBtn = buttons.find(b => b.text() === 'Close Connection')
      await closeBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.closeConnection).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call deleteChargingStation on button click', async () => {
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const deleteBtn = buttons.find(b => b.text() === 'Delete Charging Station')
      await deleteBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.deleteChargingStation).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should show success toast after starting charging station', async () => {
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const startBtn = buttons.find(b => b.text() === 'Start Charging Station')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Charging station successfully started')
    })

    it('should show error toast on start failure', async () => {
      mockClient.startChargingStation.mockRejectedValueOnce(new Error('fail'))
      const wrapper = mountCSData()
      const buttons = wrapper.findAll('button')
      const startBtn = buttons.find(b => b.text() === 'Start Charging Station')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at starting charging station')
    })
  })

  describe('connector entries', () => {
    it('should generate entries from connectors array for OCPP 1.6', () => {
      const station = createChargingStationData({
        connectors: [
          { connector: createConnectorStatus(), connectorId: 0 },
          { connector: createConnectorStatus(), connectorId: 1 },
          { connector: createConnectorStatus(), connectorId: 2 },
        ],
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(2)
    })

    it('should filter out connector 0', () => {
      const station = createChargingStationData({
        connectors: [{ connector: createConnectorStatus(), connectorId: 0 }],
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(0)
    })

    it('should generate entries from EVSEs array for OCPP 2.0.x', () => {
      const station = createChargingStationData({
        connectors: [],
        evses: [
          createEvseEntry({
            connectors: [{ connector: createConnectorStatus(), connectorId: 0 }],
            evseId: 0,
          }),
          createEvseEntry({
            connectors: [{ connector: createConnectorStatus(), connectorId: 1 }],
            evseId: 1,
          }),
          createEvseEntry({
            connectors: [{ connector: createConnectorStatus(), connectorId: 1 }],
            evseId: 2,
          }),
        ],
        stationInfo: createStationInfo({ ocppVersion: OCPPVersion.VERSION_201 }),
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(2)
    })

    it('should filter out EVSE 0', () => {
      const station = createChargingStationData({
        connectors: [],
        evses: [
          createEvseEntry({
            connectors: [{ connector: createConnectorStatus(), connectorId: 0 }],
            evseId: 0,
          }),
        ],
        stationInfo: createStationInfo({ ocppVersion: OCPPVersion.VERSION_201 }),
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(0)
    })
  })
})
