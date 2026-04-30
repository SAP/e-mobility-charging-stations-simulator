import type { ComputedRef, Ref } from 'vue'

import { computed } from 'vue'

import { useChargingStations, useUIClient } from '@/core/index.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'
import { type LayoutData } from '@/shared/composables/useLayoutData.js'
import { useServerSwitch } from '@/shared/composables/useServerSwitch.js'

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

  const { handleUIServerChange, serverSwitchPending } = useServerSwitch({
    onServerSwitched: options?.onServerSwitched,
    registerWSEventListeners,
    unregisterWSEventListeners,
  })

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

  return {
    handleUIServerChange,
    serverSwitchPending,
    simulatorPending: computed(() => simulatorPendingState.simulator),
    startSimulator,
    stopSimulator,
  }
}
