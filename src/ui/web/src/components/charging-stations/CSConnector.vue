<template>
  <td class="cs-table__action-col">
    <Button @click="startChargingStation()">Start Charging Station</Button>
    <Button @click="stopChargingStation()">Stop Charging Station</Button>
    <Button @click="openConnection()">Open Connection</Button>
    <Button @click="closeConnection()">Close Connection</Button>
    <Button @click="startTransaction()">Start Transaction</Button>
    <!-- <IdTagInputModal
      :visibility="state.isIdTagModalVisible"
      :idTag="state.idTag"
      @close="hideIdTagModal()"
      @done="Utils.compose(state.transaction, hideIdTagModal)()"
    >
      Start Transaction
    </IdTagInputModal> -->
    <Button @click="stopTransaction()">Stop Transaction</Button>
  </td>
  <td class="cs-table__connector-col">{{ connectorId }}</td>
  <td class="cs-table__status-col">{{ connector.status }}</td>
  <td class="cs-table__transaction-col">{{ connector.transactionStarted ? 'Yes' : 'No' }}</td>
</template>

<script setup lang="ts">
// import IdTagInputModal from './IdTagInputModal.vue';
import Button from '../buttons/Button.vue';

// import { reactive } from 'vue';
import UIClient from '@/composable/UIClient';
import { ConnectorStatus } from '@/type/ChargingStationType';
// import Utils from '@/composable/Utils';

const props = defineProps<{
  hashId: string;
  connector: ConnectorStatus;
  transactionId?: number;
  connectorId: number;
  idTag?: string;
}>();

// type State = {
//   isIdTagModalVisible: boolean;
//   idTag: string;
//   transaction: () => void;
// };

// const state: State = reactive({
//   isIdTagModalVisible: false,
//   idTag: '',
//   transaction: startTransaction,
// });

// function getIdTag(transaction: () => void): void {
//   state.transaction = transaction;
//   showTagModal();
// }

// function showTagModal(): void {
//   state.isIdTagModalVisible = true;
// }
// function hideIdTagModal(): void {
//   state.isIdTagModalVisible = false;
// }

function startChargingStation(): void {
  UIClient.instance.startChargingStation(props.hashId);
}
function stopChargingStation(): void {
  UIClient.instance.stopChargingStation(props.hashId);
}
function openConnection(): void {
  UIClient.instance.openConnection(props.hashId);
}
function closeConnection(): void {
  UIClient.instance.closeConnection(props.hashId);
}
function startTransaction(): void {
  UIClient.instance.startTransaction(props.hashId, props.connectorId, props.idTag);
}
function stopTransaction(): void {
  UIClient.instance.stopTransaction(props.hashId, props.transactionId);
}
</script>
