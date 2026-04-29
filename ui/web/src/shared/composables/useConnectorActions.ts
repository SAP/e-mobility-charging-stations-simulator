/**
 * @file useConnectorActions.ts
 * @description Headless composable for connector-level actions (stop transaction, lock/unlock, ATG toggle).
 */
import type { OCPPVersion } from 'ui-common'

import { computed, readonly, type Ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/composables/Utils.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'

interface ConnectorActionsDeps {
  connectorId: number | Ref<number>
  hashId: Ref<string> | string
  onRefresh?: () => void
}

/**
 * Provides connector-level action handlers with pending state management.
 * @param deps - Connector identity and optional refresh callback
 * @returns Action functions and reactive pending state
 */
export function useConnectorActions (deps: ConnectorActionsDeps) {
  const $uiClient = useUIClient()
  const $toast = useToast()
  const { pending, run } = useAsyncAction(
    { atg: false, lock: false, stopTx: false },
    deps.onRefresh
  )

  const hashId = computed(() => (typeof deps.hashId === 'string' ? deps.hashId : deps.hashId.value))
  const connectorId = computed(() =>
    typeof deps.connectorId === 'number' ? deps.connectorId : deps.connectorId.value
  )

  const stopTransaction = (
    transactionId: null | number | string | undefined,
    ocppVersion?: OCPPVersion
  ): void => {
    if (transactionId == null) {
      $toast.error('No transaction to stop')
      return
    }
    run(
      'stopTx',
      () =>
        $uiClient.stopTransaction(hashId.value, {
          ocppVersion,
          transactionId,
        }),
      'Transaction stopped',
      'Error stopping transaction'
    )
  }

  const lockConnector = (): void => {
    run(
      'lock',
      () => $uiClient.lockConnector(hashId.value, connectorId.value),
      'Connector locked',
      'Error locking connector'
    )
  }

  const unlockConnector = (): void => {
    run(
      'lock',
      () => $uiClient.unlockConnector(hashId.value, connectorId.value),
      'Connector unlocked',
      'Error unlocking connector'
    )
  }

  const startATG = (): void => {
    run(
      'atg',
      () => $uiClient.startAutomaticTransactionGenerator(hashId.value, connectorId.value),
      'ATG started',
      'Error starting ATG'
    )
  }

  const stopATG = (): void => {
    run(
      'atg',
      () => $uiClient.stopAutomaticTransactionGenerator(hashId.value, connectorId.value),
      'ATG stopped',
      'Error stopping ATG'
    )
  }

  return {
    lockConnector,
    pending: readonly(pending),
    startATG,
    stopATG,
    stopTransaction,
    unlockConnector,
  }
}
