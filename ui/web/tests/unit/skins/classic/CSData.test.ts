/**
 * @file Tests for classic CSData component
 * @description Unit tests for classic skin CSData component — station row rendering and actions.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { type ChargingStationData, OCPP16AvailabilityType, OCPPVersion } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uiClientKey } from '@/composables'
import CSData from '@/skins/classic/components/charging-stations/CSData.vue'

import { toastMock } from '../../../setup.js'
import {
  createChargingStationData,
  createConnectorStatus,
  TEST_HASH_ID,
  TEST_STATION_ID,
} from '../../constants.js'
import {
  ButtonStub,
  createMockUIClient,
  type MockUIClient,
  StateButtonStub,
  ToggleButtonStub,
} from '../../helpers.js'

interface StubProps {
  off?: () => void
  on?: () => void
}

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'charging-stations', params: {}, query: {} }),
  useRouter: () => ({
    push: mockPush,
  }),
}))

let mockClient: MockUIClient

/**
 * @param overrides - Partial ChargingStationData overrides
 * @returns Mounted CSData wrapper
 */
function mountCSData (overrides: Partial<ChargingStationData> = {}) {
  return mount(CSData, {
    global: {
      mocks: {
        $router: { push: mockPush },
      },
      provide: {
        [uiClientKey as symbol]: mockClient,
      },
      stubs: {
        Button: ButtonStub,
        CSConnector: {
          props: [
            'connector',
            'connectorId',
            'evseId',
            'hashId',
            'chargingStationId',
            'atgStatus',
            'ocppVersion',
          ],
          template: '<tr class="cs-connector-stub"><td>{{ connectorId }}</td></tr>',
        },
        StateButton: StateButtonStub,
        ToggleButton: ToggleButtonStub,
      },
    },
    props: {
      chargingStation: createChargingStationData(overrides),
    },
  })
}

describe('CSData', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render the charging station id', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain(TEST_STATION_ID)
    })

    it('should render "Yes" when started is true', () => {
      const wrapper = mountCSData({ started: true })
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('Yes')
    })

    it('should render "No" when started is false', () => {
      const wrapper = mountCSData({ started: false })
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('No')
    })

    it('should render the supervision url formatted', () => {
      const wrapper = mountCSData({ supervisionUrl: 'ws://supervisor.example.com:9000' })
      expect(wrapper.text()).toContain('ws://supervisor.\u200bexample.\u200bcom:9000')
    })

    it('should render placeholder for empty supervision url', () => {
      const wrapper = mountCSData({ supervisionUrl: '' })
      const cells = wrapper.findAll('td')
      expect(cells[2].text()).toBe('Ø')
    })

    it('should render raw string for invalid supervision url', () => {
      const wrapper = mountCSData({ supervisionUrl: 'not-a-url' })
      expect(wrapper.text()).toContain('not-a-url')
    })

    it('should render OCPP version', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('1.6')
    })

    it('should render template name', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('template-test.json')
    })

    it('should render vendor', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('TestVendor')
    })

    it('should render model', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('TestModel')
    })

    it('should render firmware version', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('1.0.0')
    })

    it('should render placeholder when firmware is undefined', () => {
      const wrapper = mountCSData({
        stationInfo: {
          baseName: 'CS-TEST',
          chargePointModel: 'M',
          chargePointVendor: 'V',
          chargingStationId: TEST_STATION_ID,
          firmwareVersion: undefined,
          hashId: TEST_HASH_ID,
          ocppVersion: OCPPVersion.VERSION_16,
          templateIndex: 0,
          templateName: 'tpl.json',
        },
      })
      const cells = wrapper.findAll('td')
      expect(cells[9].text()).toBe('Ø')
    })

    it('should render WebSocket state name', () => {
      const wrapper = mountCSData({ wsState: WebSocket.OPEN })
      expect(wrapper.text()).toContain('Open')
    })

    it('should render registration status', () => {
      const wrapper = mountCSData()
      expect(wrapper.text()).toContain('Accepted')
    })
  })

  describe('connectors from flat array', () => {
    it('should render connectors filtering out id 0', () => {
      const wrapper = mountCSData({
        connectors: [
          { connectorId: 0, connectorStatus: createConnectorStatus() },
          { connectorId: 1, connectorStatus: createConnectorStatus() },
          { connectorId: 2, connectorStatus: createConnectorStatus() },
        ],
      })
      expect(wrapper.findAll('.cs-connector-stub')).toHaveLength(2)
    })
  })

  describe('connectors from evses', () => {
    it('should flatten evses and render connectors', () => {
      const wrapper = mountCSData({
        connectors: undefined,
        evses: [
          {
            evseId: 0,
            evseStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              connectors: [{ connectorId: 0, connectorStatus: createConnectorStatus() }],
            },
          },
          {
            evseId: 1,
            evseStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              connectors: [
                { connectorId: 0, connectorStatus: createConnectorStatus() },
                { connectorId: 1, connectorStatus: createConnectorStatus() },
                { connectorId: 2, connectorStatus: createConnectorStatus() },
              ],
            },
          },
        ],
      })
      expect(wrapper.findAll('.cs-connector-stub')).toHaveLength(2)
    })
  })

  describe('actions', () => {
    it('should call startChargingStation and emit need-refresh on success', async () => {
      const wrapper = mountCSData({ started: false })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const startProps = stateButtons[0].props() as unknown as StubProps
      startProps.on?.()
      await flushPromises()
      expect(mockClient.startChargingStation).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalledWith('Charging station started')
      expect(wrapper.emitted('need-refresh')).toHaveLength(1)
    })

    it('should call stopChargingStation', async () => {
      const wrapper = mountCSData({ started: true })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const stopProps = stateButtons[0].props() as unknown as StubProps
      stopProps.off?.()
      await flushPromises()
      expect(mockClient.stopChargingStation).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalledWith('Charging station stopped')
    })

    it('should call openConnection', async () => {
      const wrapper = mountCSData({ wsState: WebSocket.CLOSED })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const openProps = stateButtons[1].props() as unknown as StubProps
      openProps.on?.()
      await flushPromises()
      expect(mockClient.openConnection).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalledWith('Connection opened')
    })

    it('should call closeConnection', async () => {
      const wrapper = mountCSData({ wsState: WebSocket.OPEN })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const closeProps = stateButtons[1].props() as unknown as StubProps
      closeProps.off?.()
      await flushPromises()
      expect(mockClient.closeConnection).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalledWith('Connection closed')
    })

    it('should call deleteChargingStation and clear localStorage', async () => {
      localStorage.setItem(`${TEST_HASH_ID}-some-key`, 'value')
      const wrapper = mountCSData()
      const buttons = wrapper.findAllComponents(ButtonStub)
      const deleteBtn = buttons[buttons.length - 1]
      await deleteBtn.trigger('click')
      await flushPromises()
      expect(mockClient.deleteChargingStation).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalledWith('Charging station deleted')
      expect(localStorage.getItem(`${TEST_HASH_ID}-some-key`)).toBeNull()
    })

    it('should toast error when startChargingStation fails', async () => {
      mockClient.startChargingStation = vi.fn().mockRejectedValue(new Error('fail'))
      const wrapper = mountCSData({ started: false })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const failProps = stateButtons[0].props() as unknown as StubProps
      failProps.on?.()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error starting charging station')
    })

    it('should toast error when deleteChargingStation fails', async () => {
      mockClient.deleteChargingStation = vi.fn().mockRejectedValue(new Error('fail'))
      const wrapper = mountCSData()
      const buttons = wrapper.findAllComponents(ButtonStub)
      const deleteBtn = buttons[buttons.length - 1]
      await deleteBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error deleting charging station')
    })
  })

  describe('toggle button navigation', () => {
    it('should render set-supervision-url toggle button', () => {
      const wrapper = mountCSData()
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      expect(toggleButtons.length).toBeGreaterThanOrEqual(1)
      expect(toggleButtons[0].props('shared')).toBe(true)
    })

    it('should trigger router push to set-supervision-url on toggle on', () => {
      const wrapper = mountCSData()
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      const toggleProps = toggleButtons[0].props() as unknown as StubProps
      toggleProps.on?.()
      expect(mockPush).toHaveBeenCalledOnce()
      const callArg = mockPush.mock.calls[0][0] as { name: string; params: Record<string, string> }
      expect(callArg.name).toBe('set-supervision-url')
      expect(callArg.params.hashId).toBe(TEST_HASH_ID)
      expect(callArg.params.chargingStationId).toBe(TEST_STATION_ID)
    })

    it('should trigger router push to charging-stations on toggle off', () => {
      const wrapper = mountCSData()
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      const toggleProps = toggleButtons[0].props() as unknown as StubProps
      toggleProps.off?.()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })
  })
})
