import type { UIServerConfigurationSection } from 'ui-common'
import type { ComputedRef, Ref } from 'vue'

import { computed, onScopeDispose, readonly, ref } from 'vue'

import {
  getFromLocalStorage,
  setToLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
  useConfiguration,
  useUIClient,
} from '@/composables/index.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'
import { type LayoutData } from '@/shared/composables/useLayoutData.js'

export interface SimulatorControlActions {
  /** Switches the active UI server, with error rollback on connection failure. */
  handleUIServerChange: (newIndex: number) => void
  /** Whether a server switch operation is in progress. */
  serverSwitchPending: Readonly<Ref<boolean>>
  /** Whether a simulator start/stop operation is in progress. */
  simulatorPending: ComputedRef<boolean>
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

  const { pending: simulatorPendingState, run: runSimulatorAction } = useAsyncAction(
    { simulator: false },
    getSimulatorState
  )
  const serverSwitchPending = ref(false)
  let activeTimeoutId: ReturnType<typeof setTimeout> | undefined
  let pendingOpenHandler: (() => void) | undefined
  let pendingErrorHandler: (() => void) | undefined

  const startSimulator = (): void => {
    runSimulatorAction('simulator', {
      action: () => $uiClient.startSimulator(),
      errorMsg: 'Error at starting simulator',
      successMsg: 'Simulator successfully started',
    })
  }

  const stopSimulator = (): void => {
    runSimulatorAction('simulator', {
      action: async () => {
        await $uiClient.stopSimulator()
        $chargingStations.value = []
        options?.onSimulatorStopped?.()
      },
      errorMsg: 'Error at stopping simulator',
      successMsg: 'Simulator successfully stopped',
    })
  }

  const SERVER_SWITCH_TIMEOUT_MS = 15_000

  const handleUIServerChange = (newIndex: number): void => {
    const currentIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
    if (newIndex === currentIndex || serverSwitchPending.value) return

    const servers = $configuration.value.uiServer as UIServerConfigurationSection[]
    if (newIndex < 0 || newIndex >= servers.length) return

    serverSwitchPending.value = true

    $uiClient.setConfiguration(servers[newIndex])
    unregisterWSEventListeners()
    registerWSEventListeners()

    let settled = false

    const openHandler = (): void => {
      if (settled) return
      settled = true
      clearTimeout(activeTimeoutId)
      $uiClient.unregisterWSEventListener('error', errorHandler)
      pendingOpenHandler = undefined
      pendingErrorHandler = undefined
      setToLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, newIndex)
      serverSwitchPending.value = false
      options?.onServerSwitched?.()
    }

    const errorHandler = (): void => {
      if (settled) return
      settled = true
      clearTimeout(activeTimeoutId)
      $uiClient.unregisterWSEventListener('open', openHandler)
      pendingOpenHandler = undefined
      pendingErrorHandler = undefined
      serverSwitchPending.value = false
      const previousIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
      const rollbackServers = $configuration.value.uiServer as UIServerConfigurationSection[]
      if (previousIndex >= 0 && previousIndex < rollbackServers.length) {
        $uiClient.setConfiguration(rollbackServers[previousIndex])
      }
      unregisterWSEventListeners()
      registerWSEventListeners()
    }

    $uiClient.registerWSEventListener('open', openHandler, { once: true })
    $uiClient.registerWSEventListener('error', errorHandler, { once: true })
    pendingOpenHandler = openHandler
    pendingErrorHandler = errorHandler

    activeTimeoutId = setTimeout(() => {
      if (!settled) {
        errorHandler()
      }
    }, SERVER_SWITCH_TIMEOUT_MS)
  }

  onScopeDispose(() => {
    if (activeTimeoutId != null) {
      clearTimeout(activeTimeoutId)
      activeTimeoutId = undefined
    }
    if (pendingOpenHandler != null) {
      $uiClient.unregisterWSEventListener('open', pendingOpenHandler)
      pendingOpenHandler = undefined
    }
    if (pendingErrorHandler != null) {
      $uiClient.unregisterWSEventListener('error', pendingErrorHandler)
      pendingErrorHandler = undefined
    }
  })

  return {
    handleUIServerChange,
    serverSwitchPending: readonly(serverSwitchPending),
    simulatorPending: computed(() => simulatorPendingState.simulator),
    startSimulator,
    stopSimulator,
  }
}
