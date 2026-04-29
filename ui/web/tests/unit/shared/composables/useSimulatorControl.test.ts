import type { ConfigurationData } from 'ui-common'

/**
 * @file Tests for useSimulatorControl
 * @description Simulator start/stop and server switch orchestration.
 */
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Ref, ref } from 'vue'

import type { LayoutData } from '@/shared/composables/useLayoutData.js'

import { useChargingStations, useConfiguration, useUIClient } from '@/composables'

import { toastMock } from '../../../setup'
import { createUIServerConfig } from '../../constants'
import { createMockUIClient, type MockUIClient, withSetup } from '../../helpers'

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...(actual as Record<string, unknown>),
    useChargingStations: vi.fn(),
    useConfiguration: vi.fn(),
    useUIClient: vi.fn(),
  }
})

import { useSimulatorControl } from '@/shared/composables/useSimulatorControl.js'

let mockClient: MockUIClient
let chargingStations: Ref<unknown[]>
let configuration: Ref<ConfigurationData>

const mockGetSimulatorState = vi.fn()
const mockRegisterWSEventListeners = vi.fn()
const mockLayoutData: Pick<LayoutData, 'getSimulatorState' | 'registerWSEventListeners'> = {
  getSimulatorState: mockGetSimulatorState,
  registerWSEventListeners: mockRegisterWSEventListeners,
}

/**
 * Mounts the useSimulatorControl composable in a component context.
 * @param options - Optional callbacks for SimulatorControlOptions
 * @returns Tuple of [composable result, app instance]
 */
function mountComposable (options?: Parameters<typeof useSimulatorControl>[1]) {
  return withSetup(() => useSimulatorControl(mockLayoutData, options))
}

describe('useSimulatorControl', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
    chargingStations = ref([])
    configuration = ref({
      uiServer: [createUIServerConfig({ port: 8080 }), createUIServerConfig({ port: 9090 })],
    } as unknown as ConfigurationData)
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as ReturnType<typeof useUIClient>)
    vi.mocked(useChargingStations).mockReturnValue(
      chargingStations as ReturnType<typeof useChargingStations>
    )
    vi.mocked(useConfiguration).mockReturnValue(configuration)
    mockGetSimulatorState.mockClear()
    mockRegisterWSEventListeners.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should start the simulator and refresh state on success', async () => {
    mockClient.startSimulator.mockResolvedValue({ status: 'success' })
    const [result] = mountComposable()
    result.startSimulator()
    await flushPromises()
    expect(mockClient.startSimulator).toHaveBeenCalledTimes(1)
    expect(mockGetSimulatorState).toHaveBeenCalled()
  })

  it('should stop the simulator and clear charging stations on success', async () => {
    mockClient.stopSimulator.mockResolvedValue({ status: 'success' })
    chargingStations.value = [{ id: 'cs-1' }, { id: 'cs-2' }]
    const [result] = mountComposable()
    result.stopSimulator()
    await flushPromises()
    expect(mockClient.stopSimulator).toHaveBeenCalledTimes(1)
    expect(chargingStations.value).toHaveLength(0)
    expect(mockGetSimulatorState).toHaveBeenCalled()
  })

  it('should show error toast when start simulator fails', async () => {
    mockClient.startSimulator.mockRejectedValue(new Error('connection refused'))
    const [result] = mountComposable()
    result.startSimulator()
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalledWith('Error at starting simulator')
  })

  it('should handle server switch with new index', () => {
    localStorage.setItem('uiServerConfigurationIndex', JSON.stringify(0))
    const [result] = mountComposable()
    result.handleUIServerChange(1)
    expect(mockClient.setConfiguration).toHaveBeenCalledWith(createUIServerConfig({ port: 9090 }))
    expect(mockRegisterWSEventListeners).toHaveBeenCalled()
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('open', expect.any(Function), {
      once: true,
    })
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('error', expect.any(Function), {
      once: true,
    })
  })

  it('should expose simulatorPending as reactive ref', () => {
    const [result] = mountComposable()
    expect(result.simulatorPending.value).toBe(false)
  })

  it('should expose serverSwitchPending as reactive ref', () => {
    const [result] = mountComposable()
    expect(result.serverSwitchPending.value).toBe(false)
  })

  it('should not start simulator when already pending', () => {
    mockClient.startSimulator.mockReturnValue(new Promise(() => undefined))
    const [result] = mountComposable()
    result.startSimulator()
    result.startSimulator()
    expect(mockClient.startSimulator).toHaveBeenCalledTimes(1)
  })

  it('should not stop simulator when already pending', () => {
    mockClient.stopSimulator.mockReturnValue(new Promise(() => undefined))
    const [result] = mountComposable()
    result.stopSimulator()
    result.stopSimulator()
    expect(mockClient.stopSimulator).toHaveBeenCalledTimes(1)
  })

  it('should not switch server when index is the same as current', () => {
    localStorage.setItem('uiServerConfigurationIndex', JSON.stringify(1))
    const [result] = mountComposable()
    result.handleUIServerChange(1)
    expect(mockClient.setConfiguration).not.toHaveBeenCalled()
  })

  it('should call onSimulatorStopped callback on successful stop', async () => {
    mockClient.stopSimulator.mockResolvedValue({ status: 'success' })
    const onSimulatorStopped = vi.fn()
    const [result] = mountComposable({ onSimulatorStopped })
    result.stopSimulator()
    await flushPromises()
    expect(onSimulatorStopped).toHaveBeenCalledTimes(1)
  })

  it('should call onServerSwitched callback when server open event fires', () => {
    localStorage.setItem('uiServerConfigurationIndex', JSON.stringify(0))
    const onServerSwitched = vi.fn()
    const [result] = mountComposable({ onServerSwitched })
    result.handleUIServerChange(1)

    const openCall = vi
      .mocked(mockClient.registerWSEventListener)
      .mock.calls.find(([event]) => event === 'open')
    const openHandler = openCall?.[1] as () => void
    openHandler()

    expect(onServerSwitched).toHaveBeenCalledTimes(1)
    expect(result.serverSwitchPending.value).toBe(false)
  })

  it('should rollback configuration on server switch error', () => {
    localStorage.setItem('uiServerConfigurationIndex', JSON.stringify(0))
    const [result] = mountComposable()
    result.handleUIServerChange(1)

    const errorCall = vi
      .mocked(mockClient.registerWSEventListener)
      .mock.calls.find(([event]) => event === 'error')
    const errorHandler = errorCall?.[1] as () => void
    errorHandler()

    expect(result.serverSwitchPending.value).toBe(false)
    expect(mockClient.setConfiguration).toHaveBeenCalledTimes(2)
    expect(mockClient.setConfiguration).toHaveBeenLastCalledWith(
      createUIServerConfig({ port: 8080 })
    )
  })
})
