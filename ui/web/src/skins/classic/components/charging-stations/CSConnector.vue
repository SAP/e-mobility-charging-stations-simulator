<template>
  <tr>
    <td>
      {{ evseId != null ? `${evseId}/${connectorId}` : connectorId }}
    </td>
    <td>
      {{ connector.status ?? EMPTY_VALUE_PLACEHOLDER }}
    </td>
    <td>
      {{ connector.locked === true ? 'Yes' : 'No' }}
    </td>
    <td>
      {{ connector.transactionStarted === true ? `Yes (${connector.transactionId})` : 'No' }}
    </td>
    <td>
      {{ atgStatus?.start === true ? 'Yes' : 'No' }}
    </td>
    <td>
      <StateButton
        :active="connector.locked === true"
        :off="() => unlockConnector()"
        off-label="Unlock"
        :on="() => lockConnector()"
        on-label="Lock"
      />
      <ToggleButton
        v-if="connector.transactionStarted !== true"
        :id="`${hashId}-${evseId ?? 0}-${connectorId}-start-transaction`"
        :off="
          () => {
            $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
          }
        "
        :on="
          () => {
            $router.push({
              name: ROUTE_NAMES.START_TRANSACTION,
              params: { hashId, chargingStationId, connectorId },
              query: {
                ...(evseId != null ? { evseId: String(evseId) } : {}),
                ...(ocppVersion != null ? { ocppVersion } : {}),
              },
            })
          }
        "
        :shared="true"
        @clicked="$emit('need-refresh')"
      >
        Start Transaction
      </ToggleButton>
      <Button
        v-else
        @click="stopTransaction()"
      >
        Stop Transaction
      </Button>
      <StateButton
        :active="atgStatus?.start === true"
        :off="() => stopAutomaticTransactionGenerator()"
        off-label="Stop ATG"
        :on="() => startAutomaticTransactionGenerator()"
        on-label="Start ATG"
      />
    </td>
  </tr>
</template>

<script setup lang="ts">
import type { ConnectorStatus, OCPPVersion, Status } from 'ui-common'

import { useToast } from 'vue-toast-notification'

import { EMPTY_VALUE_PLACEHOLDER, ROUTE_NAMES, useUIClient } from '@/composables'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'

import Button from '../buttons/Button.vue'
import StateButton from '../buttons/StateButton.vue'
import ToggleButton from '../buttons/ToggleButton.vue'

const props = defineProps<{
  atgStatus?: Status
  chargingStationId: string
  connector: ConnectorStatus
  connectorId: number
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>()

const emit = defineEmits<{ 'need-refresh': [] }>()

const $uiClient = useUIClient()

const $toast = useToast()

const { run } = useAsyncAction({ atg: false, lock: false, transaction: false }, () =>
  emit('need-refresh')
)

const stopTransaction = (): void => {
  const txId = props.connector.transactionId
  if (txId == null) {
    $toast.error('No transaction to stop')
    return
  }
  run(
    'transaction',
    () =>
      $uiClient.stopTransaction(props.hashId, {
        ocppVersion: props.ocppVersion,
        transactionId: txId,
      }),
    'Transaction successfully stopped',
    'Error at stopping transaction'
  )
}
const lockConnector = (): void => {
  run(
    'lock',
    () => $uiClient.lockConnector(props.hashId, props.connectorId),
    'Connector successfully locked',
    'Error at locking connector'
  )
}
const unlockConnector = (): void => {
  run(
    'lock',
    () => $uiClient.unlockConnector(props.hashId, props.connectorId),
    'Connector successfully unlocked',
    'Error at unlocking connector'
  )
}
const startAutomaticTransactionGenerator = (): void => {
  run(
    'atg',
    () => $uiClient.startAutomaticTransactionGenerator(props.hashId, props.connectorId),
    'Automatic transaction generator successfully started',
    'Error at starting automatic transaction generator'
  )
}
const stopAutomaticTransactionGenerator = (): void => {
  run(
    'atg',
    () => $uiClient.stopAutomaticTransactionGenerator(props.hashId, props.connectorId),
    'Automatic transaction generator successfully stopped',
    'Error at stopping automatic transaction generator'
  )
}
</script>
