/**
 * @file Tests for useLayoutData composable
 * @description Tests for the useLayoutData shared composable.
 */
import type { ConfigurationData } from 'ui-common'

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Ref, ref } from 'vue'

import { useChargingStations, useConfiguration, useTemplates, useUIClient } from '@/composables'

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...(actual as Record<string, unknown>),
    useChargingStations: vi.fn(),
    useConfiguration: vi.fn(),
    useTemplates: vi.fn(),
    useUIClient: vi.fn(),
  }
})

import { useLayoutData } from '@/shared/composables/useLayoutData.js'

import { createMockUIClient, type MockUIClient, withSetup } from '../../helpers'

let mockClient: MockUIClient
let chargingStations: Ref<unknown[]>
let templates: Ref<string[]>
let configuration: Ref<ConfigurationData>

/**
 * Finds the WS event listener handler registered for the given event type.
 * @param eventType - The WebSocket event name ('open', 'error', 'close')
 * @returns The registered handler function, or undefined if not found
 */
function getWSHandler (eventType: string): ((...args: unknown[]) => void) | undefined {
  const call = vi
    .mocked(mockClient.registerWSEventListener)
    .mock.calls.find(([event]) => event === eventType)
  return call?.[1] as ((...args: unknown[]) => void) | undefined
}

/**
 * Mounts the useLayoutData composable in a component context.
 * @returns Tuple of [composable result, app instance]
 */
function mountComposable () {
  return withSetup(() => useLayoutData())
}

describe('useLayoutData', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
    chargingStations = ref([])
    templates = ref([])
    configuration = ref({
      uiServer: [{ host: 'localhost', port: 8080, protocol: 'ui', version: '0.0.1' }],
    } as unknown as ConfigurationData)
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as ReturnType<typeof useUIClient>)
    vi.mocked(useChargingStations).mockReturnValue(
      chargingStations as ReturnType<typeof useChargingStations>
    )
    vi.mocked(useTemplates).mockReturnValue(templates)
    vi.mocked(useConfiguration).mockReturnValue(configuration)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call simulatorState, listTemplates, and listChargingStations on getData', () => {
    const [result] = mountComposable()
    mockClient.simulatorState.mockClear()
    mockClient.listTemplates.mockClear()
    mockClient.listChargingStations.mockClear()
    result.getData()
    expect(mockClient.simulatorState).toHaveBeenCalledTimes(1)
    expect(mockClient.listTemplates).toHaveBeenCalledTimes(1)
    expect(mockClient.listChargingStations).toHaveBeenCalledTimes(1)
  })

  it('should register open, error, and close WS event listeners on mount', () => {
    mountComposable()
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('open', expect.any(Function))
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    expect(mockClient.registerWSEventListener).toHaveBeenCalledWith('close', expect.any(Function))
  })

  it('should unregister open, error, and close WS event listeners on unmount', () => {
    const [, app] = mountComposable()
    app.unmount()
    expect(mockClient.unregisterWSEventListener).toHaveBeenCalledWith('open', expect.any(Function))
    expect(mockClient.unregisterWSEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    expect(mockClient.unregisterWSEventListener).toHaveBeenCalledWith('close', expect.any(Function))
  })

  it('should populate simulatorState when WS open fires and getData succeeds', async () => {
    const statePayload = { started: true, templateStatistics: {} }
    mockClient.simulatorState.mockResolvedValue({
      state: statePayload,
      status: 'success',
    })
    const [result] = mountComposable()
    const openHandler = getWSHandler('open')
    openHandler?.()
    await flushPromises()
    expect(result.simulatorState.value).toEqual(statePayload)
  })

  it('should clear charging stations on WS error', () => {
    chargingStations.value = [{ id: 'fake' }]
    mountComposable()
    const errorHandler = getWSHandler('error')
    errorHandler?.()
    expect(chargingStations.value).toHaveLength(0)
  })

  it('should clear charging stations on WS close', () => {
    chargingStations.value = [{ id: 'fake' }]
    mountComposable()
    const closeHandler = getWSHandler('close')
    closeHandler?.()
    expect(chargingStations.value).toHaveLength(0)
  })

  it('should expose loading as true when any fetch is in progress', () => {
    mockClient.simulatorState.mockReturnValue(new Promise(() => undefined))
    const [result] = mountComposable()
    result.getSimulatorState()
    expect(result.loading.value).toBe(true)
  })

  it('should expose loading as false when all fetches complete', async () => {
    const [result] = mountComposable()
    result.getData()
    await flushPromises()
    expect(result.loading.value).toBe(false)
  })

  it('should expose loading as true when listTemplates fetch is in progress', async () => {
    mockClient.simulatorState.mockResolvedValue({ state: { started: false }, status: 'success' })
    mockClient.listChargingStations.mockResolvedValue({ chargingStations: [], status: 'success' })
    mockClient.listTemplates.mockReturnValue(new Promise(() => undefined))
    const [result] = mountComposable()
    result.getData()
    await flushPromises()
    expect(result.loading.value).toBe(true)
  })

  it('should expose loading as true when listChargingStations fetch is in progress', async () => {
    mockClient.simulatorState.mockResolvedValue({ state: { started: false }, status: 'success' })
    mockClient.listTemplates.mockResolvedValue({ status: 'success', templates: [] })
    mockClient.listChargingStations.mockReturnValue(new Promise(() => undefined))
    const [result] = mountComposable()
    result.getData()
    await flushPromises()
    expect(result.loading.value).toBe(true)
  })

  it('should unsubscribe from refresh events on unmount', () => {
    const unsubscribe = vi.fn()
    mockClient.onRefresh.mockReturnValue(unsubscribe)
    const [, app] = mountComposable()
    expect(mockClient.onRefresh).toHaveBeenCalledWith(expect.any(Function))
    app.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  describe('error handling', () => {
    it('should set loading to false when getSimulatorState rejects', async () => {
      mockClient.simulatorState.mockRejectedValueOnce(new Error('network'))
      mockClient.listTemplates.mockResolvedValue({ status: 'success', templates: [] })
      mockClient.listChargingStations.mockResolvedValue({ chargingStations: [], status: 'success' })
      const [result] = mountComposable()
      result.getData()
      await flushPromises()
      expect(result.loading.value).toBe(false)
    })

    it('should set loading to false when listTemplates rejects', async () => {
      mockClient.simulatorState.mockResolvedValue({ state: { started: false }, status: 'success' })
      mockClient.listTemplates.mockRejectedValueOnce(new Error('network'))
      mockClient.listChargingStations.mockResolvedValue({ chargingStations: [], status: 'success' })
      const [result] = mountComposable()
      result.getData()
      await flushPromises()
      expect(result.loading.value).toBe(false)
    })

    it('should set loading to false when listChargingStations rejects', async () => {
      mockClient.simulatorState.mockResolvedValue({ state: { started: false }, status: 'success' })
      mockClient.listTemplates.mockResolvedValue({ status: 'success', templates: [] })
      mockClient.listChargingStations.mockRejectedValueOnce(new Error('network'))
      const [result] = mountComposable()
      result.getData()
      await flushPromises()
      expect(result.loading.value).toBe(false)
    })
  })
})
