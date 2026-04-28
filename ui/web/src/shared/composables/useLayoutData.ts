import type { ChargingStationData, SimulatorState } from 'ui-common'
import { computed, onMounted, onUnmounted, type Ref, ref } from 'vue'

import { useChargingStations, useFetchData, useTemplates, useUIClient } from '@/composables'

export interface LayoutData {
  /** Fetches simulator state, templates, and charging stations. */
  getData: () => void
  /** Fetches only the charging stations list. */
  getChargingStations: () => void
  /** Fetches only the simulator state. */
  getSimulatorState: () => void
  /** Registers WS event listeners for open/error/close. */
  registerWSEventListeners: () => void
  /** Whether the simulator has been started. */
  simulatorStarted: Ref<boolean | undefined>
  /** The current simulator state object. */
  simulatorState: Ref<SimulatorState | undefined>
  /** Unregisters WS event listeners previously registered. */
  unregisterWSEventListeners: () => void
}

/**
 * Extracts the common data-fetching and WebSocket lifecycle logic shared by layout components.
 *
 * Registers `onMounted` / `onUnmounted` hooks internally so consumers do not need to.
 * @returns Layout data state and control functions
 */
export function useLayoutData (): LayoutData {
  const $uiClient = useUIClient()
  const $templates = useTemplates()
  const $chargingStations = useChargingStations()

  const simulatorState = ref<SimulatorState | undefined>(undefined)
  const simulatorStarted = computed((): boolean | undefined => simulatorState.value?.started)

  const clearTemplates = (): void => {
    $templates.value = []
  }

  const clearChargingStations = (): void => {
    $chargingStations.value = []
  }

  const { fetch: getSimulatorState } = useFetchData(
    () => $uiClient.simulatorState(),
    response => {
      simulatorState.value = response.state as unknown as SimulatorState
    },
    'Error at fetching simulator state'
  )

  const { fetch: getTemplates } = useFetchData(
    () => $uiClient.listTemplates(),
    response => {
      $templates.value = response.templates as string[]
    },
    'Error at fetching charging station templates',
    clearTemplates
  )

  const { fetch: getChargingStations } = useFetchData(
    () => $uiClient.listChargingStations(),
    response => {
      $chargingStations.value = response.chargingStations as ChargingStationData[]
    },
    'Error at fetching charging stations',
    clearChargingStations
  )

  const getData = (): void => {
    getSimulatorState()
    getTemplates()
    getChargingStations()
  }

  const registerWSEventListeners = (): void => {
    $uiClient.registerWSEventListener('open', getData)
    $uiClient.registerWSEventListener('error', clearChargingStations)
    $uiClient.registerWSEventListener('close', clearChargingStations)
  }

  const unregisterWSEventListeners = (): void => {
    $uiClient.unregisterWSEventListener('open', getData)
    $uiClient.unregisterWSEventListener('error', clearChargingStations)
    $uiClient.unregisterWSEventListener('close', clearChargingStations)
  }

  let unsubscribeRefresh: (() => void) | undefined

  onMounted(() => {
    registerWSEventListeners()
    unsubscribeRefresh = $uiClient.onRefresh(() => {
      getChargingStations()
    })
  })

  onUnmounted(() => {
    unregisterWSEventListeners()
    unsubscribeRefresh?.()
  })

  return {
    getData,
    getChargingStations,
    getSimulatorState,
    registerWSEventListeners,
    simulatorStarted,
    simulatorState,
    unregisterWSEventListeners,
  }
}
