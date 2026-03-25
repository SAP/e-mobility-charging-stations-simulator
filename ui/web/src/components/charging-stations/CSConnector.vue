<template>
  <tr class="connectors-table__row">
    <td class="connectors-table__column">
      {{ evseId != null ? `${evseId}/${connectorId}` : connectorId }}
    </td>
    <td class="connectors-table__column">
      {{ connector.status ?? 'Ø' }}
    </td>
    <td class="connectors-table__column">
      {{ connector.locked === true ? 'Yes' : 'No' }}
    </td>
    <td class="connectors-table__column">
      {{ connector.transactionStarted === true ? `Yes (${connector.transactionId})` : 'No' }}
    </td>
    <td class="connectors-table__column">
      {{ atgStatus?.start === true ? 'Yes' : 'No' }}
    </td>
    <td class="connectors-table__column">
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
            $router.push({ name: 'charging-stations' })
          }
        "
        :on="
          () => {
            $router.push({
              name: 'start-transaction',
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
import { useToast } from 'vue-toast-notification'

import type { ConnectorStatus, OCPPVersion, Status } from '@/types'

import Button from '@/components/buttons/Button.vue'
import StateButton from '@/components/buttons/StateButton.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import { useUIClient } from '@/composables'

const props = defineProps<{
  atgStatus?: Status
  chargingStationId: string
  connector: ConnectorStatus
  connectorId: number
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>()

const $emit = defineEmits(['need-refresh'])

const uiClient = useUIClient()

const $toast = useToast()

const executeAction = (action: Promise<unknown>, successMsg: string, errorMsg: string): void => {
  action
    .then(() => {
      $emit('need-refresh')
      return $toast.success(successMsg)
    })
    .catch((error: Error) => {
      $toast.error(errorMsg)
      console.error(`${errorMsg}:`, error)
    })
}

const stopTransaction = (): void => {
  if (props.connector.transactionId == null) {
    $toast.error('No transaction to stop')
    return
  }
  executeAction(
    uiClient.stopTransaction(props.hashId, {
      ocppVersion: props.ocppVersion,
      transactionId: props.connector.transactionId,
    }),
    'Transaction successfully stopped',
    'Error at stopping transaction'
  )
}
const lockConnector = (): void => {
  executeAction(
    uiClient.lockConnector(props.hashId, props.connectorId),
    'Connector successfully locked',
    'Error at locking connector'
  )
}
const unlockConnector = (): void => {
  executeAction(
    uiClient.unlockConnector(props.hashId, props.connectorId),
    'Connector successfully unlocked',
    'Error at unlocking connector'
  )
}
const startAutomaticTransactionGenerator = (): void => {
  executeAction(
    uiClient.startAutomaticTransactionGenerator(props.hashId, props.connectorId),
    'Automatic transaction generator successfully started',
    'Error at starting automatic transaction generator'
  )
}
const stopAutomaticTransactionGenerator = (): void => {
  executeAction(
    uiClient.stopAutomaticTransactionGenerator(props.hashId, props.connectorId),
    'Automatic transaction generator successfully stopped',
    'Error at stopping automatic transaction generator'
  )
}
</script>
