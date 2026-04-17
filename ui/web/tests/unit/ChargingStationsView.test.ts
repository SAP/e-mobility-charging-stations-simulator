/**
 * @file Tests for ChargingStationsView component
 * @description Unit tests for the main view: WS event listeners, data fetching,
 *   simulator state display, CSTable visibility, UI server selector, and error handling.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ResponseStatus } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { UIClient } from '@/composables'

import {
  chargingStationsKey,
  configurationKey,
  templatesKey,
  uiClientKey,
  useUIClient,
} from '@/composables'
import ChargingStationsView from '@/views/ChargingStationsView.vue'

import { toastMock } from '../setup'
import { createChargingStationData, createUIServerConfig } from './constants'
import { createMockUIClient, type MockUIClient, StateButtonStub, ToggleButtonStub } from './helpers'

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return { ...(actual as Record<string, unknown>), useUIClient: vi.fn() }
})

vi.mock('vue-router', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useRoute: vi.fn().mockReturnValue({ name: 'charging-stations' }),
    useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  }
})

// ── Configuration fixtures ────────────────────────────────────────────────────

const singleServerConfiguration = {
  uiServer: [createUIServerConfig()],
}

const multiServerConfiguration = {
  uiServer: [
    createUIServerConfig({ name: 'Server 1' }),
    createUIServerConfig({ host: 'server2', name: 'Server 2' }),
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let mockClient: MockUIClient

/**
 * Extracts the registered WS event handler for a given event type.
 * @param eventType - WS event name (open, error, close)
 * @returns The registered handler function or undefined
 */
function getWSHandler (eventType: string): ((...args: unknown[]) => void) | undefined {
  const call = vi
    .mocked(mockClient.registerWSEventListener)
    .mock.calls.find(([event]) => event === eventType)
  return call?.[1] as ((...args: unknown[]) => void) | undefined
}

/**
 * Mounts ChargingStationsView with mock UIClient and global properties.
 * Uses transparent Container stub so v-show directives work correctly.
 * @param options - Mount configuration overrides
 * @param options.chargingStations - Initial charging stations data
 * @param options.configuration - UI server configuration (single or multi)
 * @param options.templates - Template names
 * @returns Mounted component wrapper
 */
function mountView (
  options: {
    chargingStations?: ReturnType<typeof createChargingStationData>[]
    configuration?: typeof multiServerConfiguration | typeof singleServerConfiguration
    templates?: string[]
  } = {}
) {
  const {
    chargingStations = [],
    configuration = singleServerConfiguration,
    templates = [],
  } = options

  return mount(ChargingStationsView, {
    global: {
      config: {
        globalProperties: {
          $route: { name: 'charging-stations', params: {}, query: {} },
          $router: { back: vi.fn(), push: vi.fn(), replace: vi.fn() },
        } as never,
      },
      provide: {
        [chargingStationsKey as symbol]: ref(chargingStations),
        [configurationKey as symbol]: ref(configuration),
        [templatesKey as symbol]: ref(templates),
        [uiClientKey as symbol]: mockClient,
      },
      stubs: {
        Container: { name: 'Container', template: '<div><slot /></div>' },
        CSTable: true,
        StateButton: StateButtonStub,
        ToggleButton: ToggleButtonStub,
      },
    },
  })
}

/**
 * Triggers the 'open' WS event handler to simulate a connection open (calls getData).
 */
async function triggerWSOpen (): Promise<void> {
  const openHandler = getWSHandler('open')
  openHandler?.()
  await flushPromises()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChargingStationsView', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as UIClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('WebSocket event listeners', () => {
    it('should register open, error, close listeners on mount', () => {
      mountView()
      expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('open', expect.any(Function))
      expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('error', expect.any(Function))
      expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('close', expect.any(Function))
    })

    it('should register exactly 3 listeners', () => {
      mountView()
      expect(mockClient.registerWSEventListener).toHaveBeenCalledTimes(3)
    })

    it('should unregister open, error, close listeners on unmount', () => {
      const wrapper = mountView()
      wrapper.unmount()
      expect(mockClient.unregisterWSEventListener).toHaveBeenCalledWith(
        'open',
        expect.any(Function)
      )
      expect(mockClient.unregisterWSEventListener).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      )
      expect(mockClient.unregisterWSEventListener).toHaveBeenCalledWith(
        'close',
        expect.any(Function)
      )
    })

    it('should unregister exactly 3 listeners on unmount', () => {
      const wrapper = mountView()
      wrapper.unmount()
      expect(mockClient.unregisterWSEventListener).toHaveBeenCalledTimes(3)
    })
  })

  describe('getData on WS open', () => {
    it('should call simulatorState when WS opens', async () => {
      mountView()
      await triggerWSOpen()
      expect(mockClient.simulatorState).toHaveBeenCalled()
    })

    it('should call listTemplates when WS opens', async () => {
      mountView()
      await triggerWSOpen()
      expect(mockClient.listTemplates).toHaveBeenCalled()
    })

    it('should call listChargingStations when WS opens', async () => {
      mountView()
      await triggerWSOpen()
      expect(mockClient.listChargingStations).toHaveBeenCalled()
    })
  })

  describe('simulator state display', () => {
    it('should show "Start Simulator" when simulator not started', async () => {
      mockClient.simulatorState = vi.fn().mockResolvedValue({
        state: { started: false, templateStatistics: {} },
        status: ResponseStatus.SUCCESS,
      })
      const wrapper = mountView()
      await triggerWSOpen()
      expect(wrapper.text()).toContain('Start Simulator')
    })

    it('should show "Stop Simulator" with version when started', async () => {
      mockClient.simulatorState = vi.fn().mockResolvedValue({
        state: { started: true, templateStatistics: {}, version: '1.5.0' },
        status: ResponseStatus.SUCCESS,
      })
      const wrapper = mountView()
      await triggerWSOpen()
      expect(wrapper.text()).toContain('Stop Simulator')
      expect(wrapper.text()).toContain('1.5.0')
    })

    it('should show "Start Simulator" without version initially', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Start Simulator')
      expect(wrapper.text()).not.toContain('(')
    })
  })

  describe('CSTable visibility', () => {
    it('should hide CSTable when no charging stations', () => {
      const wrapper = mountView({ chargingStations: [] })
      const csTable = wrapper.findComponent({ name: 'CSTable' })
      expect(csTable.exists()).toBe(true)
      expect((csTable.element as HTMLElement).style.display).toBe('none')
    })

    it('should show CSTable when charging stations exist', () => {
      const wrapper = mountView({
        chargingStations: [createChargingStationData()],
      })
      const csTable = wrapper.findComponent({ name: 'CSTable' })
      expect(csTable.exists()).toBe(true)
      expect((csTable.element as HTMLElement).style.display).not.toBe('none')
    })
  })

  describe('UI server selector', () => {
    it('should hide server selector for single server configuration', () => {
      const wrapper = mountView({ configuration: singleServerConfiguration })
      const selectorContainer = wrapper.find('#ui-server-container')
      expect(selectorContainer.exists()).toBe(true)
      expect((selectorContainer.element as HTMLElement).style.display).toBe('none')
    })

    it('should show server selector for multiple server configuration', () => {
      const wrapper = mountView({ configuration: multiServerConfiguration })
      const selectorContainer = wrapper.find('#ui-server-container')
      expect(selectorContainer.exists()).toBe(true)
      expect((selectorContainer.element as HTMLElement).style.display).not.toBe('none')
    })

    it('should render an option for each server', () => {
      const wrapper = mountView({ configuration: multiServerConfiguration })
      const options = wrapper.findAll('#ui-server-selector option')
      expect(options).toHaveLength(2)
    })

    it('should display server name in options', () => {
      const wrapper = mountView({ configuration: multiServerConfiguration })
      const options = wrapper.findAll('#ui-server-selector option')
      expect(options[0].text()).toContain('Server 1')
      expect(options[1].text()).toContain('Server 2')
    })

    it('should fall back to host when server name is missing', () => {
      const config = {
        uiServer: [
          createUIServerConfig({ host: 'host-a' }),
          createUIServerConfig({ host: 'host-b' }),
        ],
      }
      const wrapper = mountView({ configuration: config })
      const options = wrapper.findAll('#ui-server-selector option')
      expect(options[0].text()).toContain('host-a')
      expect(options[1].text()).toContain('host-b')
    })
  })

  describe('start/stop simulator', () => {
    it('should show success toast when simulator starts', async () => {
      mockClient.startSimulator = vi.fn().mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
      const wrapper = mountView()
      const stateButton = wrapper.findComponent({ name: 'StateButton' })
      const onProp = stateButton.props('on') as (() => void) | undefined
      onProp?.()
      await flushPromises()
      expect(mockClient.startSimulator).toHaveBeenCalled()
      expect(toastMock.success).toHaveBeenCalledWith('Simulator successfully started')
    })

    it('should show error toast when simulator start fails', async () => {
      mockClient.startSimulator = vi.fn().mockRejectedValue(new Error('start failed'))
      const wrapper = mountView()
      const stateButton = wrapper.findComponent({ name: 'StateButton' })
      const onProp = stateButton.props('on') as (() => void) | undefined
      onProp?.()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at starting simulator')
    })

    it('should show success toast when simulator stops', async () => {
      mockClient.stopSimulator = vi.fn().mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
      const wrapper = mountView()
      const stateButton = wrapper.findComponent({ name: 'StateButton' })
      const offProp = stateButton.props('off') as (() => void) | undefined
      offProp?.()
      await flushPromises()
      expect(mockClient.stopSimulator).toHaveBeenCalled()
      expect(toastMock.success).toHaveBeenCalledWith('Simulator successfully stopped')
    })

    it('should show error toast when simulator stop fails', async () => {
      mockClient.stopSimulator = vi.fn().mockRejectedValue(new Error('stop failed'))
      const wrapper = mountView()
      const stateButton = wrapper.findComponent({ name: 'StateButton' })
      const offProp = stateButton.props('off') as (() => void) | undefined
      offProp?.()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at stopping simulator')
    })
  })

  describe('error handling', () => {
    it('should show error toast when listChargingStations fails', async () => {
      mockClient.listChargingStations = vi.fn().mockRejectedValue(new Error('Network error'))
      mountView()
      await triggerWSOpen()
      expect(toastMock.error).toHaveBeenCalledWith('Error at fetching charging stations')
    })

    it('should show error toast when listTemplates fails', async () => {
      mockClient.listTemplates = vi.fn().mockRejectedValue(new Error('Template error'))
      mountView()
      await triggerWSOpen()
      expect(toastMock.error).toHaveBeenCalledWith('Error at fetching charging station templates')
    })

    it('should show error toast when simulatorState fails', async () => {
      mockClient.simulatorState = vi.fn().mockRejectedValue(new Error('State error'))
      mountView()
      await triggerWSOpen()
      expect(toastMock.error).toHaveBeenCalledWith('Error at fetching simulator state')
    })
  })

  describe('server switching', () => {
    it('should call setConfiguration when server index changes', async () => {
      const wrapper = mountView({ configuration: multiServerConfiguration })
      const selector = wrapper.find('#ui-server-selector')
      await selector.setValue(1)
      expect(mockClient.setConfiguration).toHaveBeenCalled()
    })

    it('should register new WS event listeners after server switch', async () => {
      const wrapper = mountView({ configuration: multiServerConfiguration })
      // Reset call count from initial mount registration
      vi.mocked(mockClient.registerWSEventListener).mockClear()
      const selector = wrapper.find('#ui-server-selector')
      await selector.setValue(1)
      // registerWSEventListeners called again
      expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('open', expect.any(Function))
    })

    it('should save server index to localStorage on successful switch', async () => {
      const wrapper = mountView({ configuration: multiServerConfiguration })
      const selector = wrapper.find('#ui-server-selector')
      await selector.setValue(1)
      // Simulate the WS open for the new connection (once-listener from server switching)
      const onceOpenCalls = vi
        .mocked(mockClient.registerWSEventListener)
        .mock.calls.filter(
          ([event, , options]) =>
            event === 'open' &&
            (options as undefined | { once?: boolean }) != null &&
            (options as { once?: boolean }).once === true
        )
      const onceOpenHandler = onceOpenCalls[onceOpenCalls.length - 1]?.[1] as
        | (() => void)
        | undefined
      onceOpenHandler?.()
      await flushPromises()
      expect(localStorage.getItem('uiServerConfigurationIndex')).toBe('1')
    })

    it('should revert server index on connection error', async () => {
      localStorage.setItem('uiServerConfigurationIndex', '0')
      const wrapper = mountView({ configuration: multiServerConfiguration })
      const selector = wrapper.find('#ui-server-selector')
      await selector.setValue(1)
      // Find the once-error listener
      const onceErrorCalls = vi
        .mocked(mockClient.registerWSEventListener)
        .mock.calls.filter(
          ([event, , options]) =>
            event === 'error' &&
            (options as undefined | { once?: boolean }) != null &&
            (options as { once?: boolean }).once === true
        )
      const onceErrorHandler = onceErrorCalls[onceErrorCalls.length - 1]?.[1] as
        | (() => void)
        | undefined
      onceErrorHandler?.()
      await flushPromises()
      // Should revert to index 0
      expect(mockClient.setConfiguration).toHaveBeenCalledTimes(2)
    })
  })
})
