import type { ChargingStationData, SimulatorState, UIServerConfigurationSection } from 'ui-common'

import {
  computed,
  type ComputedRef,
  onMounted,
  onUnmounted,
  readonly,
  type Ref,
  shallowRef,
} from 'vue'

import { useChargingStations, useConfiguration, useTemplates, useUIClient } from '@/core/index.js'

import { useFetchData } from './useFetchData.js'

export interface LayoutData {
  /** Fetches only the charging stations list. */
  getChargingStations: () => void
  /** Fetches simulator state, templates, and charging stations. */
  getData: () => void
  /** Fetches only the simulator state. */
  getSimulatorState: () => void
  /** Whether any data fetch is currently in progress. */
  loading: ComputedRef<boolean>
  /** Registers WS event listeners for open/error/close. */
  registerWSEventListeners: () => void
  /** Whether the simulator has been started. */
  simulatorStarted: ComputedRef<boolean | undefined>
  /** The current simulator state object. */
  simulatorState: Readonly<Ref<SimulatorState | undefined>>
  /** Mapped array of UI server configurations with their indices. */
  uiServerConfigurations: ComputedRef<
    { configuration: UIServerConfigurationSection; index: number }[]
  >
  /** Unregisters WS event listeners previously registered. */
  unregisterWSEventListeners: () => void
}

/**
 * Extracts the common data-fetching and WebSocket lifecycle logic shared by layout components.
 *
 * Registers `onMounted` / `onUnmounted` hooks internally. Also exposes
 * `registerWSEventListeners` / `unregisterWSEventListeners` for manual lifecycle management.
 * @returns Layout data state and control functions
 */
export function useLayoutData (): LayoutData {
  const $uiClient = useUIClient()
  const $configuration = useConfiguration()
  const $templates = useTemplates()
  const $chargingStations = useChargingStations()

  const simulatorState = shallowRef<SimulatorState | undefined>(undefined)
  const simulatorStarted = computed((): boolean | undefined => simulatorState.value?.started)

  const clearTemplates = (): void => {
    $templates.value = []
  }

  const clearChargingStations = (): void => {
    $chargingStations.value = []
  }

  const { fetch: getSimulatorState, fetching: fetchingSimulatorState } = useFetchData(
    () => $uiClient.simulatorState(),
    response => {
      simulatorState.value = response.state as unknown as SimulatorState
    },
    'Error at fetching simulator state'
  )

  const { fetch: getTemplates, fetching: fetchingTemplates } = useFetchData(
    () => $uiClient.listTemplates(),
    response => {
      $templates.value = response.templates as string[]
    },
    'Error at fetching charging station templates',
    clearTemplates
  )

  const { fetch: getChargingStations, fetching: fetchingChargingStations } = useFetchData(
    () => $uiClient.listChargingStations(),
    response => {
      $chargingStations.value = response.chargingStations as ChargingStationData[]
    },
    'Error at fetching charging stations',
    clearChargingStations
  )

  const loading = computed(
    () => fetchingSimulatorState.value || fetchingTemplates.value || fetchingChargingStations.value
  )

  const uiServerConfigurations = computed(() =>
    ($configuration.value.uiServer as UIServerConfigurationSection[]).map(
      (configuration, index) => ({ configuration, index })
    )
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
    if ($uiClient.isConnected()) {
      getData()
    }
  })

  onUnmounted(() => {
    unregisterWSEventListeners()
    unsubscribeRefresh?.()
  })

  return {
    getChargingStations,
    getData,
    getSimulatorState,
    loading,
    // Exposed for edge cases (e.g. hot-reload); normally called via onMounted/onUnmounted.
    registerWSEventListeners,
    simulatorStarted,
    simulatorState: readonly(simulatorState) as Readonly<Ref<SimulatorState | undefined>>,
    uiServerConfigurations,
    unregisterWSEventListeners,
  }
}
