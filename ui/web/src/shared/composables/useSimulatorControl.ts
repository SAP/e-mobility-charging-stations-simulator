import type { UIServerConfigurationSection } from 'ui-common'
import type { Ref } from 'vue'

import { readonly, ref } from 'vue'

import {
  getFromLocalStorage,
  setToLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
  useConfiguration,
  useExecuteAction,
  useUIClient,
} from '@/composables'
import { useLayoutData } from '@/shared/composables/useLayoutData.js'

export interface SimulatorControlOptions {
  /** Called after a successful server switch (e.g. to clear UI state). */
  onServerSwitched?: () => void
  /** Called after the simulator stops successfully (e.g. to reset toggle buttons). */
  onSimulatorStopped?: () => void
}

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

/**
 * Shared composable encapsulating simulator start/stop and UI server switching logic.
 *
 * Provides consistent error handling and rollback behavior across layout skins.
 * @param options - Optional callbacks for skin-specific side effects
 * @returns Simulator control actions and pending state refs
 */
export function useSimulatorControl (options?: SimulatorControlOptions): SimulatorControlActions {
  const $uiClient = useUIClient()
  const $configuration = useConfiguration()
  const $chargingStations = useChargingStations()

  const { getSimulatorState, registerWSEventListeners } = useLayoutData()
  const executeAction = useExecuteAction()

  const simulatorPending = ref(false)
  const serverSwitchPending = ref(false)

  const startSimulator = (): void => {
    if (simulatorPending.value) return
    simulatorPending.value = true
    executeAction(
      $uiClient.startSimulator(),
      'Simulator successfully started',
      'Error at starting simulator',
      {
        onFinally: () => {
          simulatorPending.value = false
          getSimulatorState()
        },
      }
    )
  }

  const stopSimulator = (): void => {
    if (simulatorPending.value) return
    simulatorPending.value = true
    executeAction(
      $uiClient.stopSimulator(),
      'Simulator successfully stopped',
      'Error at stopping simulator',
      {
        onFinally: () => {
          simulatorPending.value = false
          getSimulatorState()
        },
        onSuccess: () => {
          $chargingStations.value = []
          options?.onSimulatorStopped?.()
        },
      }
    )
  }

  const handleUIServerChange = (newIndex: number): void => {
    const currentIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
    if (newIndex === currentIndex) return

    serverSwitchPending.value = true

    $uiClient.setConfiguration(
      ($configuration.value.uiServer as UIServerConfigurationSection[])[newIndex]
    )
    registerWSEventListeners()

    $uiClient.registerWSEventListener(
      'open',
      () => {
        setToLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, newIndex)
        serverSwitchPending.value = false
        options?.onServerSwitched?.()
      },
      { once: true }
    )

    $uiClient.registerWSEventListener(
      'error',
      () => {
        serverSwitchPending.value = false
        const previousIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
        $uiClient.setConfiguration(
          ($configuration.value.uiServer as UIServerConfigurationSection[])[previousIndex]
        )
        registerWSEventListeners()
      },
      { once: true }
    )
  }

  return {
    handleUIServerChange,
    serverSwitchPending: readonly(serverSwitchPending),
    simulatorPending: readonly(simulatorPending),
    startSimulator,
    stopSimulator,
  }
}
