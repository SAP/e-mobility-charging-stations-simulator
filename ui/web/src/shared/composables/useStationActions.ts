/**
 * @file useStationActions.ts
 * @description Headless composable for station-level actions (start/stop, connect/disconnect, delete).
 */
import { readonly } from 'vue'

import { useUIClient } from '@/composables/Utils.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'

/**
 * Provides station-level action handlers with pending state management.
 * @param options - Optional configuration
 * @param options.onRefresh - Callback invoked after successful actions
 * @returns Action functions and reactive pending state
 */
export function useStationActions (options?: { onRefresh?: () => void }) {
  const $uiClient = useUIClient()
  const { pending, run } = useAsyncAction(
    { connection: false, delete: false, startStop: false },
    options?.onRefresh
  )

  const startStation = (hashId: string): void => {
    run(
      'startStop',
      () => $uiClient.startChargingStation(hashId),
      'Charging station started',
      'Error starting charging station'
    )
  }

  const stopStation = (hashId: string): void => {
    run(
      'startStop',
      () => $uiClient.stopChargingStation(hashId),
      'Charging station stopped',
      'Error stopping charging station'
    )
  }

  const openConnection = (hashId: string): void => {
    run(
      'connection',
      () => $uiClient.openConnection(hashId),
      'Connection opened',
      'Error opening connection'
    )
  }

  const closeConnection = (hashId: string): void => {
    run(
      'connection',
      () => $uiClient.closeConnection(hashId),
      'Connection closed',
      'Error closing connection'
    )
  }

  const deleteStation = (hashId: string, onSuccess?: () => void): void => {
    run(
      'delete',
      () => $uiClient.deleteChargingStation(hashId),
      'Charging station deleted',
      'Error deleting charging station',
      onSuccess
    )
  }

  return {
    closeConnection,
    deleteStation,
    openConnection,
    pending: readonly(pending),
    startStation,
    stopStation,
  }
}
