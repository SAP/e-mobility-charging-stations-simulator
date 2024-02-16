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
  </tr>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
// import { reactive } from 'vue'
// import IdTagInputModal from '@/components/charging-stations/IdTagInputModal.vue'
import Button from '@/components/buttons/Button.vue'
import type { ConnectorStatus, Status } from '@/types'
// import { compose } from '@/composables'

const props = defineProps<{
  hashId: string
  connectorId: number
  connector: ConnectorStatus
  atgStatus?: Status
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
