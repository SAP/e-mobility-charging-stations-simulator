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
export function useStationActions (options?: { onRefresh?: () => void }): {
  closeConnection: (hashId: string) => void
  deleteStation: (hashId: string, onSuccess?: () => void) => void
  openConnection: (hashId: string) => void
  pending: Readonly<{ connection: boolean; delete: boolean; startStop: boolean }>
  startStation: (hashId: string) => void
  stopStation: (hashId: string) => void
} {
  const $uiClient = useUIClient()
  const { pending, run } = useAsyncAction(
    { connection: false, delete: false, startStop: false },
    options?.onRefresh
  )

  const startStation = (hashId: string): void => {
    run('startStop', {
      action: () => $uiClient.startChargingStation(hashId),
      errorMsg: 'Error starting charging station',
      successMsg: 'Charging station started',
    })
  }

  const stopStation = (hashId: string): void => {
    run('startStop', {
      action: () => $uiClient.stopChargingStation(hashId),
      errorMsg: 'Error stopping charging station',
      successMsg: 'Charging station stopped',
    })
  }

  const openConnection = (hashId: string): void => {
    run('connection', {
      action: () => $uiClient.openConnection(hashId),
      errorMsg: 'Error opening connection',
      successMsg: 'Connection opened',
    })
  }

  const closeConnection = (hashId: string): void => {
    run('connection', {
      action: () => $uiClient.closeConnection(hashId),
      errorMsg: 'Error closing connection',
      successMsg: 'Connection closed',
    })
  }

  const deleteStation = (hashId: string, onSuccess?: () => void): void => {
    run('delete', {
      action: () => $uiClient.deleteChargingStation(hashId),
      errorMsg: 'Error deleting charging station',
      onSuccess,
      successMsg: 'Charging station deleted',
    })
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
