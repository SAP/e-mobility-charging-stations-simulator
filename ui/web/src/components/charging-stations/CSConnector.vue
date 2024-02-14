<template>
  <td class="cs-table__column">
    <Button @click="startChargingStation()">Start Charging Station</Button>
    <Button @click="stopChargingStation()">Stop Charging Station</Button>
    <Button @click="openConnection()">Open Connection</Button>
    <Button @click="closeConnection()">Close Connection</Button>
    <Button @click="startTransaction()">Start Transaction</Button>
    <!-- <IdTagInputModal
      :visibility="state.isIdTagModalVisible"
      :id-tag="state.idTag"
      @close="hideIdTagModal()"
      @done="compose(state.transaction, hideIdTagModal)()"
    >
      Start Transaction
    </IdTagInputModal> -->
    <Button @click="stopTransaction()">Stop Transaction</Button>
    <Button @click="startAutomaticTransactionGenerator()">Start ATG</Button>
    <Button @click="stopAutomaticTransactionGenerator()">Stop ATG</Button>
  </td>
  <td class="cs-table__column">{{ connectorId }}</td>
  <td class="cs-table__column">{{ connector.status ?? 'Ø' }}</td>
  <td class="cs-table__column">{{ connector.transactionStarted === true ? 'Yes' : 'No' }}</td>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
// import { reactive } from 'vue';
// import IdTagInputModal from '@/components/charging-stations/IdTagInputModal.vue'
import Button from '@/components/buttons/Button.vue'
import type { ConnectorStatus } from '@/types'
// import { compose } from '@/composables'

const props = defineProps<{
  hashId: string
  connector: ConnectorStatus
  connectorId: number
  transactionId?: number
  idTag?: string
}>()

// type State = {
//   isIdTagModalVisible: boolean
//   idTag: string
//   transaction: () => void
// }

// const state: State = reactive({
//   isIdTagModalVisible: false,
//   idTag: '',
//   transaction: startTransaction
// })

// function getIdTag(transaction: () => void): void {
//   state.transaction = transaction
//   showTagModal()
// }

// function showTagModal(): void {
//   state.isIdTagModalVisible = true
// }
// function hideIdTagModal(): void {
//   state.isIdTagModalVisible = false
// }

const UIClient = getCurrentInstance()?.appContext.config.globalProperties.$UIClient

function startChargingStation(): void {
  UIClient.startChargingStation(props.hashId)
}
function stopChargingStation(): void {
  UIClient.stopChargingStation(props.hashId)
}
function openConnection(): void {
  UIClient.openConnection(props.hashId)
}
function closeConnection(): void {
  UIClient.closeConnection(props.hashId)
}
function startTransaction(): void {
  UIClient.startTransaction(props.hashId, props.connectorId, props.idTag)
}
function stopTransaction(): void {
  UIClient.stopTransaction(props.hashId, props.transactionId)
}
function startAutomaticTransactionGenerator(): void {
  UIClient.startAutomaticTransactionGenerator(props.hashId, props.connectorId)
}
function stopAutomaticTransactionGenerator(): void {
  UIClient.stopAutomaticTransactionGenerator(props.hashId, props.connectorId)
}
</script>
