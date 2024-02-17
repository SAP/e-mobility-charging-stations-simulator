<template>
  <tr class="connectors-table__row">
    <td class="connectors-table__column">{{ connectorId }}</td>
    <td class="connectors-table__column">{{ connector.status ?? 'Ø' }}</td>
    <td class="connectors-table__column">
      {{ connector.transactionStarted === true ? 'Yes' : 'No' }}
    </td>
    <td class="connectors-table__column">
      {{ atgStatus?.start === true ? 'Yes' : 'No' }}
    </td>
    <td class="connectors-table__column">
      <Button
        @click="
          $router.push({
            name: 'start-transaction',
            params: { hashId, chargingStationId, connectorId }
          })
        "
        >Start Transaction</Button
      >
      <Button @click="stopTransaction()">Stop Transaction</Button>
      <Button @click="startAutomaticTransactionGenerator()">Start ATG</Button>
      <Button @click="stopAutomaticTransactionGenerator()">Stop ATG</Button>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import Button from '@/components/buttons/Button.vue'
import type { ConnectorStatus, Status } from '@/types'

const props = defineProps<{
  hashId: string
  chargingStationId: string
  connectorId: number
  connector: ConnectorStatus
  atgStatus?: Status
}>()

const uiClient = getCurrentInstance()?.appContext.config.globalProperties.$uiClient

function stopTransaction(): void {
  uiClient.stopTransaction(props.hashId, props.connector.transactionId)
}
function startAutomaticTransactionGenerator(): void {
  uiClient.startAutomaticTransactionGenerator(props.hashId, props.connectorId)
}
function stopAutomaticTransactionGenerator(): void {
  uiClient.stopAutomaticTransactionGenerator(props.hashId, props.connectorId)
}
</script>
