/**
 * @file Tests for ModernLayout component
 * @description Main layout: WS listeners, data fetching, simulator start/stop,
 *   UI server switching, empty-state rendering.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  chargingStationsKey,
  configurationKey,
  templatesKey,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  uiClientKey,
  useUIClient,
} from '@/core/index.js'
import ModernLayout from '@/skins/modern/ModernLayout.vue'

import { toastMock } from '../../../setup.js'
import { createChargingStationData, createUIServerConfig } from '../../constants'
import { createMockUIClient, type MockUIClient } from '../../helpers.js'

vi.mock('@/core/index.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...(actual as Record<string, unknown>), useUIClient: vi.fn() }
})

let mockClient: MockUIClient

const singleServer = { uiServer: [createUIServerConfig({ name: 'A' })] }
const multiServer = {
  uiServer: [createUIServerConfig({ name: 'A' }), createUIServerConfig({ host: 'b', name: 'B' })],
}

/**
 * @param eventType - WebSocket event name to look up
 * @returns The registered handler for the given event, or undefined if not registered
 */
function getWSHandler (eventType: string): ((...args: unknown[]) => void) | undefined {
  const call = vi
    .mocked(mockClient.registerWSEventListener)
    .mock.calls.find(([event]) => event === eventType)
  return call?.[1] as ((...args: unknown[]) => void) | undefined
}

/**
 * @param options - Mount options for the view
 * @param options.chargingStations - Charging station data to provide
 * @param options.configuration - UI server configuration to provide
 * @param options.templates - Template names to provide
 * @returns Mounted wrapper for ModernLayout
 */
function mountView (
  options: {
    chargingStations?: ReturnType<typeof createChargingStationData>[]
    configuration?: typeof multiServer | typeof singleServer
    templates?: string[]
  } = {}
) {
  const { chargingStations = [], configuration = singleServer, templates = [] } = options
  return mount(ModernLayout, {
    global: {
      provide: {
        [chargingStationsKey as symbol]: ref(chargingStations),
        [configurationKey as symbol]: ref(configuration),
        [templatesKey as symbol]: ref(templates),
        [uiClientKey as symbol]: mockClient,
      },
      stubs: {
        AddStationsDialog: true,
        AuthorizeDialog: true,
        ConfirmDialog: {
          emits: ['cancel', 'confirm'],
          props: ['title', 'message', 'confirmLabel', 'pending'],
          template:
            '<div class="stub-confirm-dialog"><button class="stub-confirm" @click="$emit(\'confirm\')">ok</button><button class="stub-cancel" @click="$emit(\'cancel\')">x</button></div>',
        },
        SetSupervisionUrlDialog: true,
        SimulatorBar: {
          emits: ['add', 'switch-server', 'toggle-simulator'],
          props: [
            'selectedServerIndex',
            'simulatorPending',
            'simulatorState',
            'uiServerConfigurations',
          ],
          template: `<div class="stub-sim-bar">
            <button class="stub-add" @click="$emit('add')">+</button>
            <button class="stub-toggle" @click="$emit('toggle-simulator')">t</button>
            <button class="stub-switch" @click="$emit('switch-server', 1)">s</button>
          </div>`,
        },
        StartTransactionDialog: true,
        StationCard: {
          emits: ['need-refresh', 'open-authorize', 'open-set-url', 'open-start-tx'],
          props: ['chargingStation'],
          template:
            '<article class="stub-station-card"><button class="stub-need-refresh" @click="$emit(\'need-refresh\')">r</button></article>',
        },
      },
    },
  })
}

describe('ModernLayout', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as ReturnType<typeof useUIClient>)
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render the empty state when no stations', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('No charging stations')
  })

  it('should render a StationCard per charging station', async () => {
    const stations = [
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
    ]
    mockClient.listChargingStations = vi
      .fn()
      .mockResolvedValue({ chargingStations: stations, status: 'success' })
    const wrapper = mountView({ chargingStations: stations })
    await flushPromises()
    expect(wrapper.findAll('.stub-station-card')).toHaveLength(2)
  })

  it('should register WS event listeners on mount and unregisters on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('open', expect.any(Function))
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('close', expect.any(Function))
    wrapper.unmount()
    expect(mockClient.unregisterWSEventListener).toHaveBeenCalled()
  })

  it('should fetch data when the WS open handler fires', async () => {
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

  it('should open the confirm dialog when toggling a running simulator', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: true, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    getWSHandler('open')?.()
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stub-confirm-dialog').exists()).toBe(true)
  })

  it('should stop the simulator when confirm dialog fires confirm', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: true, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    getWSHandler('open')?.()
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-confirm').trigger('click')
    await flushPromises()
    expect(mockClient.stopSimulator).toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('should cancel the confirm dialog', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: true, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    getWSHandler('open')?.()
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    await wrapper.find('.stub-cancel').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stub-confirm-dialog').exists()).toBe(false)
    expect(mockClient.stopSimulator).not.toHaveBeenCalled()
  })

  it('should start the simulator when toggled while stopped', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: false, templateStatistics: {} },
      status: 'success',
    })
    const wrapper = mountView()
    await flushPromises()
    getWSHandler('open')?.()
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    expect(mockClient.startSimulator).toHaveBeenCalled()
  })

  it('should toast an error when startSimulator fails', async () => {
    mockClient.simulatorState = vi.fn().mockResolvedValue({
      state: { started: false, templateStatistics: {} },
      status: 'success',
    })
    mockClient.startSimulator = vi.fn().mockRejectedValue(new Error('x'))
    const wrapper = mountView()
    await flushPromises()
    getWSHandler('open')?.()
    await flushPromises()
    await wrapper.find('.stub-toggle').trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })

  it('should switch UI server on switch-server event', async () => {
    const wrapper = mountView({ configuration: multiServer })
    await flushPromises()
    await wrapper.find('.stub-switch').trigger('click')
    expect(mockClient.setConfiguration).toHaveBeenCalledWith(multiServer.uiServer[1])
  })

  it('should skip switch when the same server is selected (index persisted from localStorage)', async () => {
    localStorage.setItem(UI_SERVER_CONFIGURATION_INDEX_KEY, '1')
    const wrapper = mountView({ configuration: multiServer })
    await flushPromises()
    mockClient.setConfiguration.mockClear()
    await wrapper.find('.stub-switch').trigger('click')
    await flushPromises()
    expect(mockClient.setConfiguration).not.toHaveBeenCalled()
  })

  it('should persist uiServerIndex to localStorage via the WS open listener (once)', async () => {
    const wrapper = mountView({ configuration: multiServer })
    await flushPromises()
    await wrapper.find('.stub-switch').trigger('click')
    await flushPromises()
    const mockCalls = vi.mocked(mockClient.registerWSEventListener).mock.calls
    const oneShotOpen = mockCalls.find(call => {
      const event = call[0] as string
      const opts = call[2] as undefined | { once?: boolean }
      return event === 'open' && opts?.once === true
    })
    expect(oneShotOpen).toBeDefined()
    const handler = (oneShotOpen as unknown as unknown[])[1] as () => void
    handler()
    expect(localStorage.getItem(UI_SERVER_CONFIGURATION_INDEX_KEY)).toBe('1')
  })

  it('should clear the station list when a WS error handler fires', async () => {
    const stations = ref([createChargingStationData()])
    const wrapper = mount(ModernLayout, {
      global: {
        provide: {
          [chargingStationsKey as symbol]: stations,
          [configurationKey as symbol]: ref(singleServer),
          [templatesKey as symbol]: ref([]),
          [uiClientKey as symbol]: mockClient,
        },
        stubs: {
          AddStationsDialog: true,
          AuthorizeDialog: true,
          ConfirmDialog: true,
          SetSupervisionUrlDialog: true,
          SimulatorBar: true,
          StartTransactionDialog: true,
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

  it('should open authorize dialog when station card emits open-authorize', async () => {
    const station = createChargingStationData({
      stationInfo: {
        baseName: 'CS-1',
        chargePointModel: 'm',
        chargePointVendor: 'v',
        chargingStationId: 'CS-1',
        hashId: 'h1',
        templateIndex: 0,
        templateName: 't',
      },
    })
    mockClient.listChargingStations = vi
      .fn()
      .mockResolvedValue({ chargingStations: [station], status: 'success' })
    const wrapper = mount(ModernLayout, {
      global: {
        provide: {
          [chargingStationsKey as symbol]: ref([station]),
          [configurationKey as symbol]: ref(singleServer),
          [templatesKey as symbol]: ref([]),
          [uiClientKey as symbol]: mockClient,
        },
        stubs: {
          AddStationsDialog: true,
          AuthorizeDialog: true,
          ConfirmDialog: true,
          SetSupervisionUrlDialog: true,
          SimulatorBar: true,
          StartTransactionDialog: true,
          StationCard: {
            emits: ['need-refresh', 'open-authorize', 'open-set-url', 'open-start-tx'],
            props: ['chargingStation'],
            template: `<article class="stub-station-card">
              <button class="stub-authorize" @click="$emit('open-authorize', { chargingStationId: 'CS-1', hashId: 'h1' })">auth</button>
              <button class="stub-set-url" @click="$emit('open-set-url', { chargingStationId: 'CS-1', hashId: 'h1' })">url</button>
              <button class="stub-start-tx" @click="$emit('open-start-tx', { chargingStationId: 'CS-1', connectorId: '1', hashId: 'h1' })">tx</button>
            </article>`,
          },
        },
      },
    })
    await flushPromises()
    await wrapper.find('.stub-authorize').trigger('click')
    await wrapper.find('.stub-set-url').trigger('click')
    await wrapper.find('.stub-start-tx').trigger('click')
    await flushPromises()
    // Verify dialog components exist (stubbed to true = rendered when dialog state is set)
    expect(wrapper.findComponent({ name: 'AuthorizeDialog' }).exists()).toBe(true)
    wrapper.unmount()
  })
})
