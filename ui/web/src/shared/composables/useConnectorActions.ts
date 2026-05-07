/**
 * @file useConnectorActions.ts
 * @description Headless composable for connector-level actions (stop transaction, lock/unlock, ATG toggle, set connector status).
 */
import type { OCPPVersion } from 'ui-common'

import { type ChargePointStatus, type OCPP16ChargePointErrorCode } from 'ui-common'
import { computed, type MaybeRefOrGetter, readonly, toValue } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/core/index.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'

interface ConnectorActionsDeps {
  connectorId: MaybeRefOrGetter<number>
  evseId?: MaybeRefOrGetter<number | undefined>
  hashId: MaybeRefOrGetter<string>
  ocppVersion?: MaybeRefOrGetter<OCPPVersion | undefined>
}

/**
 * Provides connector-level action handlers with pending state management.
 * @param deps - Connector identity and optional refresh callback
 * @returns Action functions and reactive pending state
 */
export function useConnectorActions (deps: ConnectorActionsDeps): {
  lockConnector: () => void
  pending: Readonly<{ atg: boolean; lock: boolean; setStatus: boolean; stopTx: boolean }>
  setConnectorStatus: (
    status: ChargePointStatus,
    onSuccess?: () => void,
    errorCode?: OCPP16ChargePointErrorCode
  ) => void
  startATG: () => void
  stopATG: () => void
  stopTransaction: (
    transactionId: null | number | string | undefined,
    ocppVersion?: OCPPVersion
  ) => void
  unlockConnector: () => void
} {
  const $uiClient = useUIClient()
  const $toast = useToast()
  const { pending, run } = useAsyncAction({
    atg: false,
    lock: false,
    setStatus: false,
    stopTx: false,
  })

  const hashId = computed(() => toValue(deps.hashId))
  const connectorId = computed(() => toValue(deps.connectorId))
  const evseId = computed(() => toValue(deps.evseId))
  const ocppVersion = computed(() => toValue(deps.ocppVersion))

  const stopTransaction = (
    transactionId: null | number | string | undefined,
    ocppVersion?: OCPPVersion
  ): void => {
    if (transactionId == null) {
      $toast.error('No transaction to stop')
      return
    }
    run('stopTx', {
      action: () =>
        $uiClient.stopTransaction(hashId.value, {
          ocppVersion,
          transactionId,
        }),
      errorMsg: 'Error stopping transaction',
      successMsg: 'Transaction stopped',
    })
  }

  const lockConnector = (): void => {
    // 'lock' key is shared by lockConnector and unlockConnector
    run('lock', {
      action: () => $uiClient.lockConnector(hashId.value, connectorId.value),
      errorMsg: 'Error locking connector',
      successMsg: 'Connector locked',
    })
  }

  const unlockConnector = (): void => {
    run('lock', {
      action: () => $uiClient.unlockConnector(hashId.value, connectorId.value),
      errorMsg: 'Error unlocking connector',
      successMsg: 'Connector unlocked',
    })
  }

  const startATG = (): void => {
    run('atg', {
      action: () => $uiClient.startAutomaticTransactionGenerator(hashId.value, connectorId.value),
      errorMsg: 'Error starting ATG',
      successMsg: 'ATG started',
    })
  }

  const stopATG = (): void => {
    run('atg', {
      action: () => $uiClient.stopAutomaticTransactionGenerator(hashId.value, connectorId.value),
      errorMsg: 'Error stopping ATG',
      successMsg: 'ATG stopped',
    })
  }

  const setConnectorStatus = (
    status: ChargePointStatus,
    onSuccess?: () => void,
    errorCode?: OCPP16ChargePointErrorCode
  ): void => {
    run('setStatus', {
      action: () =>
        $uiClient.setConnectorStatus(
          hashId.value,
          connectorId.value,
          status,
          evseId.value,
          ocppVersion.value,
          errorCode
        ),
      errorMsg: 'Error setting connector status',
      onSuccess,
      successMsg: 'Connector status updated',
    })
  }

  return {
    lockConnector,
    pending: readonly(pending),
    setConnectorStatus,
    startATG,
    stopATG,
    stopTransaction,
    unlockConnector,
  }
}
