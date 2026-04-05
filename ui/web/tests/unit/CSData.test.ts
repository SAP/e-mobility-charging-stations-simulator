/**
 * @file Tests for CSData component
 * @description Unit tests for charging station row display, actions, and connector entry generation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UIClient } from '@/composables'
import type { ChargingStationData } from '@/types'

import CSConnector from '@/components/charging-stations/CSConnector.vue'
import CSData from '@/components/charging-stations/CSData.vue'
import { useUIClient } from '@/composables'
import { EMPTY_VALUE_PLACEHOLDER } from '@/composables/Constants'
import { OCPPVersion } from '@/types'

import { toastMock } from '../setup'
import {
  createChargingStationData,
  createConnectorStatus,
  createEvseEntry,
  createStationInfo,
} from './constants'
import { ButtonStub, createMockUIClient, type MockUIClient, StateButtonStub } from './helpers'

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
        StateButton: StateButtonStub,
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
      expect(cells[9].text()).toBe(EMPTY_VALUE_PLACEHOLDER)
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
      expect(cells[3].text()).toBe(EMPTY_VALUE_PLACEHOLDER)
    })

    it('should display registration status', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('Accepted')
    })

    it('should display Ø when no boot notification response', () => {
      const station = createChargingStationData({ bootNotificationResponse: undefined })
      const wrapper = mountCSData(station)
      const cells = wrapper.findAll('td')
      expect(cells[4].text()).toBe(EMPTY_VALUE_PLACEHOLDER)
    })

    it('should display WebSocket state as Connecting when CONNECTING', () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: WebSocket.CONNECTING }))
      expect(wrapper.text()).toContain('Connecting')
    })

    it('should display WebSocket state as Closing when CLOSING', () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: WebSocket.CLOSING }))
      expect(wrapper.text()).toContain('Closing')
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
      const wrapper = mountCSData(createChargingStationData({ started: false }))
      const buttons = wrapper.findAll('button')
      const startBtn = buttons.find(b => b.text() === 'Start Charging Station')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.startChargingStation).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call stopChargingStation on button click', async () => {
      const wrapper = mountCSData(createChargingStationData({ started: true }))
      const buttons = wrapper.findAll('button')
      const stopBtn = buttons.find(b => b.text() === 'Stop Charging Station')
      await stopBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.stopChargingStation).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call openConnection on button click', async () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: WebSocket.CLOSED }))
      const buttons = wrapper.findAll('button')
      const openBtn = buttons.find(b => b.text() === 'Open Connection')
      await openBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.openConnection).toHaveBeenCalledWith('test-hash-id-abc123')
    })

    it('should call closeConnection on button click', async () => {
      const wrapper = mountCSData(createChargingStationData({ wsState: WebSocket.OPEN }))
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
      const wrapper = mountCSData(createChargingStationData({ started: false }))
      const buttons = wrapper.findAll('button')
      const startBtn = buttons.find(b => b.text() === 'Start Charging Station')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Charging station successfully started')
    })

    it('should show error toast on start failure', async () => {
      mockClient.startChargingStation.mockRejectedValueOnce(new Error('fail'))
      const wrapper = mountCSData(createChargingStationData({ started: false }))
      const buttons = wrapper.findAll('button')
      const startBtn = buttons.find(b => b.text() === 'Start Charging Station')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at starting charging station')
    })

    it('should clean localStorage entries for deleted station', async () => {
      const stationData = createChargingStationData()
      const hashId = stationData.stationInfo.hashId
      localStorage.setItem(`toggle-button-${hashId}-test`, 'true')
      localStorage.setItem(`shared-toggle-button-${hashId}-other`, 'false')
      localStorage.setItem('unrelated-key', 'keep')
      const wrapper = mountCSData(stationData)
      const buttons = wrapper.findAll('button')
      const deleteBtn = buttons.find(b => b.text().includes('Delete'))
      await deleteBtn?.trigger('click')
      await flushPromises()
      expect(localStorage.getItem(`toggle-button-${hashId}-test`)).toBeNull()
      expect(localStorage.getItem(`shared-toggle-button-${hashId}-other`)).toBeNull()
      expect(localStorage.getItem('unrelated-key')).toBe('keep')
    })
  })

  describe('connector entries', () => {
    it('should generate entries from connectors array for OCPP 1.6', () => {
      const station = createChargingStationData({
        connectors: [
          { connectorId: 0, connectorStatus: createConnectorStatus() },
          { connectorId: 1, connectorStatus: createConnectorStatus() },
          { connectorId: 2, connectorStatus: createConnectorStatus() },
        ],
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(2)
    })

    it('should filter out connector 0', () => {
      const station = createChargingStationData({
        connectors: [{ connectorId: 0, connectorStatus: createConnectorStatus() }],
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(0)
    })

    it('should generate entries from EVSEs array for OCPP 2.0.x', () => {
      const station = createChargingStationData({
        connectors: [],
        evses: [
          createEvseEntry({
            evseId: 0,
            evseStatus: {
              availability: 'Operative' as never,
              connectors: [{ connectorId: 0, connectorStatus: createConnectorStatus() }],
            },
          }),
          createEvseEntry({
            evseId: 1,
            evseStatus: {
              availability: 'Operative' as never,
              connectors: [{ connectorId: 1, connectorStatus: createConnectorStatus() }],
            },
          }),
          createEvseEntry({
            evseId: 2,
            evseStatus: {
              availability: 'Operative' as never,
              connectors: [{ connectorId: 1, connectorStatus: createConnectorStatus() }],
            },
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
            evseId: 0,
            evseStatus: {
              availability: 'Operative' as never,
              connectors: [{ connectorId: 0, connectorStatus: createConnectorStatus() }],
            },
          }),
        ],
        stationInfo: createStationInfo({ ocppVersion: OCPPVersion.VERSION_201 }),
      })
      const wrapper = mountCSData(station)
      expect(wrapper.findAllComponents(CSConnector)).toHaveLength(0)
    })
  })
})
