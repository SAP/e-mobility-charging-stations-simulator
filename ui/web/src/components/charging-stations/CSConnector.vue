<template>
  <tr class="connectors-table__row">
    <td class="connectors-table__column">
      {{ connectorId }}
    </td>
    <td class="connectors-table__column">
      {{ connector.status ?? 'Ø' }}
    </td>
    <td class="connectors-table__column">
      {{ connector.transactionStarted === true ? `Yes (${connector.transactionId})` : 'No' }}
    </td>
    <td class="connectors-table__column">
      {{ atgStatus?.start === true ? 'Yes' : 'No' }}
    </td>
    <td class="connectors-table__column">
      <ToggleButton
        :id="`${hashId}-${connectorId}-start-transaction`"
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
            })
          }
        "
        :shared="true"
        @clicked="$emit('need-refresh')"
      >
        Start Transaction
      </ToggleButton>
      <Button @click="stopTransaction()">
        Stop Transaction
      </Button>
      <Button @click="startAutomaticTransactionGenerator()">
        Start ATG
      </Button>
      <Button @click="stopAutomaticTransactionGenerator()">
        Stop ATG
      </Button>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { useToast } from 'vue-toast-notification'

import type { ConnectorStatus, Status } from '@/types'

import Button from '@/components/buttons/Button.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import { useUIClient } from '@/composables'

const props = defineProps<{
  atgStatus?: Status
  chargingStationId: string
  connector: ConnectorStatus
  connectorId: number
  hashId: string
}>()

const $emit = defineEmits(['need-refresh'])

const uiClient = useUIClient()

const $toast = useToast()

const stopTransaction = (): void => {
  if (props.connector.transactionId == null) {
    $toast.error('No transaction to stop')
    return
  }
  uiClient
    .stopTransaction(props.hashId, props.connector.transactionId)
    .then(() => {
      return $toast.success('Transaction successfully stopped')
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping transaction')
      console.error('Error at stopping transaction:', error)
    })
}
const startAutomaticTransactionGenerator = (): void => {
  uiClient
    .startAutomaticTransactionGenerator(props.hashId, props.connectorId)
    .then(() => {
      return $toast.success('Automatic transaction generator successfully started')
    })
    .catch((error: Error) => {
      $toast.error('Error at starting automatic transaction generator')
      console.error('Error at starting automatic transaction generator:', error)
    })
}
const stopAutomaticTransactionGenerator = (): void => {
  uiClient
    .stopAutomaticTransactionGenerator(props.hashId, props.connectorId)
    .then(() => {
      return $toast.success('Automatic transaction generator successfully stopped')
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping automatic transaction generator')
      console.error('Error at stopping automatic transaction generator:', error)
    })
}
</script>
