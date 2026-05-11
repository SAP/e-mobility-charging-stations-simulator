/**
 * @file Tests for classic CSConnector component
 * @description Unit tests for classic skin CSConnector component — connector row rendering and actions.
 */
import { flushPromises, mount } from '@vue/test-utils'
import {
  type ConnectorStatus,
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  OCPP20ConnectorStatusEnumType,
  OCPPVersion,
} from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uiClientKey } from '@/core/index.js'
import CSConnector from '@/skins/classic/components/charging-stations/CSConnector.vue'

import { toastMock } from '../../../setup.js'
import { createConnectorStatus, TEST_HASH_ID, TEST_STATION_ID } from '../../constants.js'
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

const mockPush = vi.fn().mockResolvedValue(undefined)

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'charging-stations', params: {}, query: {} }),
  useRouter: () => ({
    push: mockPush,
  }),
}))

let mockClient: MockUIClient

interface MountOptions {
  atgStatus?: { start: boolean }
  connectorId?: number
  connectorOverrides?: Partial<ConnectorStatus>
  evseId?: number
  ocppVersion?: OCPPVersion
}

/**
 * @param options - Mount configuration options
 * @returns Mounted CSConnector wrapper
 */
function mountConnector (options: MountOptions = {}) {
  const {
    atgStatus,
    connectorId = 1,
    connectorOverrides = {},
    evseId,
    ocppVersion = OCPPVersion.VERSION_16,
  } = options

  return mount(CSConnector, {
    global: {
      mocks: {
        $router: { push: mockPush },
      },
      provide: {
        [uiClientKey as symbol]: mockClient,
      },
      stubs: {
        Button: ButtonStub,
        StateButton: StateButtonStub,
        ToggleButton: ToggleButtonStub,
      },
    },
    props: {
      atgStatus,
      chargingStationId: TEST_STATION_ID,
      connector: createConnectorStatus(connectorOverrides),
      connectorId,
      evseId,
      hashId: TEST_HASH_ID,
      ocppVersion,
    },
  })
}

describe('CSConnector', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render connector id without evse', () => {
      const wrapper = mountConnector({ connectorId: 2 })
      const cells = wrapper.findAll('td')
      expect(cells[0].text()).toBe('2')
    })

    it('should render evseId/connectorId when evseId is set', () => {
      const wrapper = mountConnector({ connectorId: 3, evseId: 1 })
      const cells = wrapper.findAll('td')
      expect(cells[0].text()).toBe('1/3')
    })

    it('should render "Yes" when locked', () => {
      const wrapper = mountConnector({
        connectorOverrides: { locked: true },
      })
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('Yes')
    })

    it('should render "No" when not locked', () => {
      const wrapper = mountConnector({
        connectorOverrides: { locked: false },
      })
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('No')
    })

    it('should render transaction info when transaction is started', () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionId: 42, transactionStarted: true },
      })
      const cells = wrapper.findAll('td')
      expect(cells[2].text()).toBe('Yes (42)')
    })

    it('should render "No" when no transaction', () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionStarted: false },
      })
      const cells = wrapper.findAll('td')
      expect(cells[2].text()).toBe('No')
    })

    it('should render ATG started "Yes" when atgStatus.start is true', () => {
      const wrapper = mountConnector({ atgStatus: { start: true } })
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('Yes')
    })

    it('should render ATG started "No" when atgStatus is undefined', () => {
      const wrapper = mountConnector({ atgStatus: undefined })
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('No')
    })
  })

  describe('actions', () => {
    it('should call lockConnector', async () => {
      const wrapper = mountConnector({ connectorId: 2 })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const lockProps = stateButtons[0].props() as unknown as StubProps
      lockProps.on?.()
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalled()
    })

    it('should call unlockConnector', async () => {
      const wrapper = mountConnector({
        connectorId: 1,
        connectorOverrides: { locked: true },
      })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const unlockProps = stateButtons[0].props() as unknown as StubProps
      unlockProps.off?.()
      await flushPromises()
      expect(mockClient.unlockConnector).toHaveBeenCalled()
    })

    it('should show Start Transaction toggle when no transaction', () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionStarted: false },
      })
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      expect(toggleButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('should show Stop Transaction button when transaction started', () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionId: 10, transactionStarted: true },
      })
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      expect(toggleButtons).toHaveLength(0)
      const buttons = wrapper.findAllComponents(ButtonStub)
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })

    it('should call stopTransaction with transactionId', async () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionId: 55, transactionStarted: true },
      })
      const buttons = wrapper.findAllComponents(ButtonStub)
      await buttons[0].trigger('click')
      await flushPromises()
      expect(mockClient.stopTransaction).toHaveBeenCalled()
    })

    it('should toast error when stopTransaction has no transactionId', async () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionId: undefined, transactionStarted: true },
      })
      const buttons = wrapper.findAllComponents(ButtonStub)
      await buttons[0].trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.stopTransaction).not.toHaveBeenCalled()
    })

    it('should call startAutomaticTransactionGenerator', async () => {
      const wrapper = mountConnector({ connectorId: 3 })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const atgStartProps = stateButtons[1].props() as unknown as StubProps
      atgStartProps.on?.()
      await flushPromises()
      expect(mockClient.startAutomaticTransactionGenerator).toHaveBeenCalled()
    })

    it('should call stopAutomaticTransactionGenerator', async () => {
      const wrapper = mountConnector({ atgStatus: { start: true }, connectorId: 3 })
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const atgStopProps = stateButtons[1].props() as unknown as StubProps
      atgStopProps.off?.()
      await flushPromises()
      expect(mockClient.stopAutomaticTransactionGenerator).toHaveBeenCalled()
    })

    it('should toast error when lockConnector fails', async () => {
      mockClient.lockConnector = vi.fn().mockRejectedValue(new Error('fail'))
      const wrapper = mountConnector()
      const stateButtons = wrapper.findAllComponents(StateButtonStub)
      const failProps = stateButtons[0].props() as unknown as StubProps
      failProps.on?.()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
    })

    it('should render OCPP 1.6 status options by default', () => {
      const wrapper = mountConnector()
      const selects = wrapper.findAll('select.connector-action-select')
      const statusSelect = selects[0]
      const options = statusSelect.findAll('option')
      expect(options.length).toBe(Object.values(OCPP16ChargePointStatus).length)
    })

    it('should render OCPP 2.0.x status options for OCPP 2.0.1 station', () => {
      const wrapper = mountConnector({ ocppVersion: OCPPVersion.VERSION_201 })
      const selects = wrapper.findAll('select.connector-action-select')
      const statusSelect = selects[0]
      const options = statusSelect.findAll('option')
      expect(options.length).toBe(Object.values(OCPP20ConnectorStatusEnumType).length)
    })

    it('should hide error code select for OCPP 2.0.x', () => {
      const wrapper = mountConnector({ ocppVersion: OCPPVersion.VERSION_201 })
      const selects = wrapper.findAll('select.connector-action-select')
      expect(selects.length).toBe(1)
    })

    it('should show error code select for OCPP 1.6', () => {
      const wrapper = mountConnector({ ocppVersion: OCPPVersion.VERSION_16 })
      const selects = wrapper.findAll('select.connector-action-select')
      expect(selects.length).toBe(2)
      const errorOptions = selects[1].findAll('option')
      expect(errorOptions.length).toBe(Object.values(OCPP16ChargePointErrorCode).length)
    })

    it('should call setConnectorStatus on status change', async () => {
      const wrapper = mountConnector()
      const selects = wrapper.findAll('select.connector-action-select')
      await selects[0].setValue(OCPP16ChargePointStatus.FAULTED)
      await flushPromises()
      expect(mockClient.setConnectorStatus).toHaveBeenCalledWith(
        TEST_HASH_ID,
        1,
        OCPP16ChargePointStatus.FAULTED,
        undefined,
        OCPPVersion.VERSION_16,
        OCPP16ChargePointErrorCode.NO_ERROR
      )
    })
  })

  describe('start transaction navigation', () => {
    it('should push to start-transaction route on toggle on', () => {
      const wrapper = mountConnector({
        connectorId: 2,
        connectorOverrides: { transactionStarted: false },
        evseId: 1,
        ocppVersion: OCPPVersion.VERSION_16,
      })
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      const navOnProps = toggleButtons[0].props() as unknown as StubProps
      navOnProps.on?.()
      expect(mockPush).toHaveBeenCalledOnce()
      const callArg = mockPush.mock.calls[0][0] as { name: string; params: Record<string, unknown> }
      expect(callArg.name).toBe('start-transaction')
      expect(callArg.params.hashId).toBe(TEST_HASH_ID)
      expect(callArg.params.chargingStationId).toBe(TEST_STATION_ID)
      expect(callArg.params.connectorId).toBe(2)
    })

    it('should push to charging-stations route on toggle off', () => {
      const wrapper = mountConnector({
        connectorOverrides: { transactionStarted: false },
      })
      const toggleButtons = wrapper.findAllComponents(ToggleButtonStub)
      const navOffProps = toggleButtons[0].props() as unknown as StubProps
      navOffProps.off?.()
      expect(mockPush).toHaveBeenCalledWith({ name: 'charging-stations' })
    })
  })
})
