/**
 * @file Tests for v2 ChargingStationsView
 * @description Main view: WS listeners, data fetching, simulator start/stop,
 *   UI server switching, theme cycling, empty-state rendering.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  chargingStationsKey,
  configurationKey,
  templatesKey,
  uiClientKey,
  useUIClient,
} from '@/composables'
import { V2_THEME_KEY, V2_UI_SERVER_INDEX_KEY } from '@/v2/composables/v2Constants'
import V2ChargingStationsView from '@/v2/views/V2ChargingStationsView.vue'

import { toastMock } from '../../setup'
import { createChargingStationData, createUIServerConfig } from '../constants'
import { createMockUIClient, type MockUIClient } from '../helpers'

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return { ...(actual as Record<string, unknown>), useUIClient: vi.fn() }
})

vi.mock('vue-router', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useRoute: vi.fn(),
    useRouter: vi.fn(),
  }
})

import { useRoute, useRouter } from 'vue-router'

let mockClient: MockUIClient
let mockRouter: { push: ReturnType<typeof vi.fn> }

const singleServer = { uiServer: [createUIServerConfig({ name: 'A' })] }
const multiServer = {
  uiServer: [createUIServerConfig({ name: 'A' }), createUIServerConfig({ host: 'b', name: 'B' })],
}

/**
 * Returns the registered WS handler for a given event.
 * @param eventType WebSocket event name
 * @returns handler or undefined
 */
function getWSHandler (eventType: string): ((...args: unknown[]) => void) | undefined {
  const call = vi
    .mocked(mockClient.registerWSEventListener)
    .mock.calls.find(([event]) => event === eventType)
  return call?.[1] as ((...args: unknown[]) => void) | undefined
}

/**
 * Mount the view with reactive refs for DI.
 * @param options mount overrides
 * @param options.chargingStations initial stations
 * @param options.configuration configuration (single or multi-server)
 * @param options.templates templates
 * @returns mounted wrapper
 */
function mountView (
  options: {
    chargingStations?: ReturnType<typeof createChargingStationData>[]
    configuration?: typeof multiServer | typeof singleServer
    templates?: string[]
  } = {}
) {
  const { chargingStations = [], configuration = singleServer, templates = [] } = options
  return mount(V2ChargingStationsView, {
    global: {
      provide: {
        [chargingStationsKey as symbol]: ref(chargingStations),
        [configurationKey as symbol]: ref(configuration),
        [templatesKey as symbol]: ref(templates),
        [uiClientKey as symbol]: mockClient,
      },
      stubs: {
        ConfirmDialog: {
          emits: ['cancel', 'confirm'],
          props: ['title', 'message', 'confirmLabel', 'pending'],
          template:
            '<div class="stub-confirm-dialog"><button class="stub-confirm" @click="$emit(\'confirm\')">ok</button><button class="stub-cancel" @click="$emit(\'cancel\')">x</button></div>',
        },
        RouterLink: true,
        SimulatorBar: {
          emits: ['add', 'cycle-theme', 'refresh', 'switch-server', 'toggle-simulator'],
          props: [
            'refreshPending',
            'selectedServerIndex',
            'simulatorPending',
            'simulatorState',
            'themeMode',
            'uiServerConfigurations',
          ],
          template: `<div class="stub-sim-bar">
            <button class="stub-refresh" @click="$emit('refresh')">r</button>
            <button class="stub-add" @click="$emit('add')">+</button>
            <button class="stub-toggle" @click="$emit('toggle-simulator')">t</button>
            <button class="stub-theme" @click="$emit('cycle-theme')">h</button>
            <button class="stub-switch" @click="$emit('switch-server', 1)">s</button>
          </div>`,
        },
        StationCard: {
          emits: ['need-refresh'],
          props: ['chargingStation'],
          template:
            '<article class="stub-station-card"><button class="stub-need-refresh" @click="$emit(\'need-refresh\')">r</button></article>',
        },
      },
    },
  })
}

beforeEach(() => {
  mockClient = createMockUIClient()
  mockRouter = { push: vi.fn().mockResolvedValue(undefined) }
  vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as ReturnType<typeof useUIClient>)
  vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
  vi.mocked(useRoute).mockReturnValue({
    name: 'v2-charging-stations',
  } as unknown as ReturnType<typeof useRoute>)
  localStorage.clear()
  delete document.documentElement.dataset.v2Theme
})

afterEach(() => {
  delete document.documentElement.dataset.v2Theme
})

describe('v2 ChargingStationsView', () => {
  it('renders the empty state when no stations', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('No charging stations')
  })

  it('renders a StationCard per charging station', async () => {
    const wrapper = mountView({
      chargingStations: [
        createChargingStationData({
          stationInfo: {
            baseName: 'CS-1',
            chargePointModel: 'm',
            chargePointVendor: 'v',
            chargingStationId: 'CS-1',
            hashId: 'h1',
            templateIndex: 0,
            templateName: 't',
          },
        }),
        createChargingStationData({
          stationInfo: {
            baseName: 'CS-2',
            chargePointModel: 'm',
            chargePointVendor: 'v',
            chargingStationId: 'CS-2',
            hashId: 'h2',
            templateIndex: 0,
            templateName: 't',
          },
        }),
      ],
    })
    await flushPromises()
    expect(wrapper.findAll('.stub-station-card')).toHaveLength(2)
  })

  it('registers WS event listeners on mount and unregisters on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('open', expect.any(Function))
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('close', expect.any(Function))
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    wrapper.unmount()
    expect(mockClient.unregisterWSEventListener).toHaveBeenCalled()
  })

  it('fetches data when the WS open handler fires', async () => {
    mountView()
    await flushPromises()
    mockClient.listChargingStations.mockClear()
    mockClient.simulatorState.mockClear()
    mockClient.listTemplates.mockClear()
    const openHandler = getWSHandler('open')
    openHandler?.()
    await flushPromises()
    expect(mockClient.listChargingStations).toHaveBeenCalled()
    expect(mockClient.simulatorState).toHaveBeenCalled()
    expect(mockClient.listTemplates).toHaveBeenCalled()
  })

  it('opens the confirm dialog when toggling a running simulator', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: true, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    // Trigger a refresh so the state is populated
    await wrapper.find('.stub-refresh').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stub-confirm-dialog').exists()).toBe(true)
  })

  it('stops the simulator when confirm dialog fires confirm', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: true, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.stub-refresh').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-confirm').trigger('click')
    await flushPromises()
    expect(mockClient.stopSimulator).toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('cancels the confirm dialog', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: true, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.stub-refresh').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-cancel').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stub-confirm-dialog').exists()).toBe(false)
    expect(mockClient.stopSimulator).not.toHaveBeenCalled()
  })

  it('starts the simulator when toggled while stopped', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: false, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.stub-refresh').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    expect(mockClient.startSimulator).toHaveBeenCalled()
  })

  it('toasts an error when startSimulator fails', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: false, templateStatistics: {} },
      status: 'success',
    })
    mockClient.startSimulator = vi.fn().mockRejectedValue(new Error('x'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.stub-refresh').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })

  it('navigates to add-stations dialog on add', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.stub-add').trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'v2-add-charging-stations' })
  })

  it('cycles theme through dark → light → auto → dark', async () => {
    localStorage.setItem(V2_THEME_KEY, JSON.stringify('dark'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.stub-theme').trigger('click')
    // dark → light
    expect(localStorage.getItem(V2_THEME_KEY)).toBe(JSON.stringify('light'))
    await wrapper.find('.stub-theme').trigger('click')
    expect(localStorage.getItem(V2_THEME_KEY)).toBe(JSON.stringify('auto'))
    await wrapper.find('.stub-theme').trigger('click')
    expect(localStorage.getItem(V2_THEME_KEY)).toBe(JSON.stringify('dark'))
  })

  it('switches UI server on switch-server event', async () => {
    const wrapper = mountView({ configuration: multiServer })
    await flushPromises()
    await wrapper.find('.stub-switch').trigger('click')
    expect(mockClient.setConfiguration).toHaveBeenCalledWith(multiServer.uiServer[1])
  })

  it('skips switch when the same server is selected (index persisted from localStorage)', async () => {
    // Seed localStorage with index 1 so the view's initial uiServerIndex is 1,
    // then switching to 1 should short-circuit.
    localStorage.setItem(V2_UI_SERVER_INDEX_KEY, '1')
    const wrapper = mountView({ configuration: multiServer })
    await flushPromises()
    // Reset the mock so we only observe post-mount calls
    mockClient.setConfiguration.mockClear()
    // The stub emits index 1, matching the current index → expect early return
    await wrapper.find('.stub-switch').trigger('click')
    await flushPromises()
    expect(mockClient.setConfiguration).not.toHaveBeenCalled()
  })

  it('persists uiServerIndex to localStorage via the WS open listener (once)', async () => {
    const wrapper = mountView({ configuration: multiServer })
    await flushPromises()
    await wrapper.find('.stub-switch').trigger('click')
    await flushPromises()
    // The switch registers a { once: true } open listener via registerWSEventListener.
    const mockCalls = vi.mocked(mockClient.registerWSEventListener).mock.calls
    const oneShotOpen = mockCalls.find(call => {
      const event = call[0] as string
      const opts = call[2] as undefined | { once?: boolean }
      return event === 'open' && opts?.once === true
    })
    expect(oneShotOpen).toBeDefined()
    const handler = (oneShotOpen as unknown as unknown[])[1] as () => void
    handler()
    expect(localStorage.getItem(V2_UI_SERVER_INDEX_KEY)).toBe('1')
  })

  it('clears the station list when a WS error handler fires', async () => {
    const stations = ref([createChargingStationData()])
    const wrapper = mount(V2ChargingStationsView, {
      global: {
        provide: {
          [chargingStationsKey as symbol]: stations,
          [configurationKey as symbol]: ref(singleServer),
          [templatesKey as symbol]: ref([]),
          [uiClientKey as symbol]: mockClient,
        },
        stubs: {
          ConfirmDialog: true,
          RouterLink: true,
          SimulatorBar: true,
          StationCard: true,
        },
      },
    })
    await flushPromises()
    const errorHandler = getWSHandler('error')
    errorHandler?.()
    expect(stations.value).toHaveLength(0)
    wrapper.unmount()
  })
})
