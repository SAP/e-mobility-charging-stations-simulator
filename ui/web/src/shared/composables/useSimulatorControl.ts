import type { UIServerConfigurationSection } from 'ui-common'
import type { Ref } from 'vue'

import { readonly, ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import {
  getFromLocalStorage,
  setToLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
  useConfiguration,
  useUIClient,
} from '@/composables'
import { type LayoutData } from '@/shared/composables/useLayoutData.js'

export interface SimulatorControlActions {
  /** Switches the active UI server, with error rollback on connection failure. */
  handleUIServerChange: (newIndex: number) => void
  /** Whether a server switch operation is in progress. */
  serverSwitchPending: Readonly<Ref<boolean>>
  /** Whether a simulator start/stop operation is in progress. */
  simulatorPending: Readonly<Ref<boolean>>
  /** Starts the simulator and refreshes state on completion. */
  startSimulator: () => void
  /** Stops the simulator and clears charging stations on success. */
  stopSimulator: () => void
}

export interface SimulatorControlOptions {
  /** Called after a successful server switch (e.g. to clear UI state). */
  onServerSwitched?: () => void
  /** Called after the simulator stops successfully (e.g. to reset toggle buttons). */
  onSimulatorStopped?: () => void
}

/**
 * Shared composable encapsulating simulator start/stop and UI server switching logic.
 *
 * Provides consistent error handling and rollback behavior across layout skins.
 * @param layoutData - Layout data providing getSimulatorState, registerWSEventListeners, and unregisterWSEventListeners
 * @param options - Optional callbacks for skin-specific side effects
 * @returns Simulator control actions and pending state refs
 */
export function useSimulatorControl (
  layoutData: Partial<Pick<LayoutData, 'unregisterWSEventListeners'>> &
    Pick<LayoutData, 'getSimulatorState' | 'registerWSEventListeners'>,
  options?: SimulatorControlOptions
): SimulatorControlActions {
  const $uiClient = useUIClient()
  const $configuration = useConfiguration()
  const $chargingStations = useChargingStations()

  const { getSimulatorState, registerWSEventListeners } = layoutData
  const unregisterWSEventListeners =
    layoutData.unregisterWSEventListeners ??
    ((): void => {
      /* no-op */
    })

  const simulatorPending = ref(false)
  const serverSwitchPending = ref(false)
  const $toast = useToast()

  const startSimulator = (): void => {
    if (simulatorPending.value) return
    simulatorPending.value = true
    // eslint-disable-next-line promise/catch-or-return
    $uiClient
      .startSimulator()
      .then(() => {
        $toast.success('Simulator successfully started')
        return undefined
      })
      .catch((error: unknown) => {
        $toast.error('Error at starting simulator')
        console.error('Error at starting simulator:', error)
      })
      .finally(() => {
        simulatorPending.value = false
        getSimulatorState()
      })
  }

  const stopSimulator = (): void => {
    if (simulatorPending.value) return
    simulatorPending.value = true
    // eslint-disable-next-line promise/catch-or-return
    $uiClient
      .stopSimulator()
      .then(() => {
        $chargingStations.value = []
        options?.onSimulatorStopped?.()
        $toast.success('Simulator successfully stopped')
        return undefined
      })
      .catch((error: unknown) => {
        $toast.error('Error at stopping simulator')
        console.error('Error at stopping simulator:', error)
      })
      .finally(() => {
        simulatorPending.value = false
        getSimulatorState()
      })
  }

  const SERVER_SWITCH_TIMEOUT_MS = 15_000

  const handleUIServerChange = (newIndex: number): void => {
    const currentIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
    if (newIndex === currentIndex || serverSwitchPending.value) return

    serverSwitchPending.value = true

    $uiClient.setConfiguration(
      ($configuration.value.uiServer as UIServerConfigurationSection[])[newIndex]
    )
    unregisterWSEventListeners()
    registerWSEventListeners()

    let settled = false

    const openHandler = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      $uiClient.unregisterWSEventListener('error', errorHandler)
      setToLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, newIndex)
      serverSwitchPending.value = false
      options?.onServerSwitched?.()
    }

    const errorHandler = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      $uiClient.unregisterWSEventListener('open', openHandler)
      serverSwitchPending.value = false
      const previousIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
      $uiClient.setConfiguration(
        ($configuration.value.uiServer as UIServerConfigurationSection[])[previousIndex]
      )
      unregisterWSEventListeners()
      registerWSEventListeners()
    }

    $uiClient.registerWSEventListener('open', openHandler, { once: true })
    $uiClient.registerWSEventListener('error', errorHandler, { once: true })

    const timeoutId = setTimeout(() => {
      if (!settled) {
        errorHandler()
      }
    }, SERVER_SWITCH_TIMEOUT_MS)
  }

  return {
    handleUIServerChange,
    serverSwitchPending: readonly(serverSwitchPending),
    simulatorPending: readonly(simulatorPending),
    startSimulator,
    stopSimulator,
  }
}
