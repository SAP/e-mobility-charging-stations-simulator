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
    <Button @click="startAutomaticTransactionGenerator()">Start ATG</Button>
    <Button @click="stopAutomaticTransactionGenerator()">Stop ATG</Button>
  </td>
  <td class="cs-table__connector-col">{{ connectorId }}</td>
  <td class="cs-table__status-col">{{ connector.status }}</td>
  <td class="cs-table__transaction-col">{{ connector.transactionStarted ? 'Yes' : 'No' }}</td>
</template>

<script setup lang="ts">
// import IdTagInputModal from './IdTagInputModal.vue';
import Button from '../buttons/Button.vue';

// import { reactive } from 'vue';
import UIClient from '@/composables/UIClient';
import type { ConnectorStatus } from '@/types/ChargingStationType';
// import Utils from '@/composables/Utils';

const props = defineProps<{
  hashId: string;
  connector: ConnectorStatus;
  connectorId: number;
  transactionId?: number;
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
  UIClient.getInstance().startChargingStation(props.hashId);
}
function stopChargingStation(): void {
  UIClient.getInstance().stopChargingStation(props.hashId);
}
function openConnection(): void {
  UIClient.getInstance().openConnection(props.hashId);
}
function closeConnection(): void {
  UIClient.getInstance().closeConnection(props.hashId);
}
function startTransaction(): void {
  UIClient.getInstance().startTransaction(props.hashId, props.connectorId, props.idTag);
}
function stopTransaction(): void {
  UIClient.getInstance().stopTransaction(props.hashId, props.transactionId);
}
function startAutomaticTransactionGenerator(): void {
  UIClient.getInstance().startAutomaticTransactionGenerator(props.hashId, props.connectorId);
}
function stopAutomaticTransactionGenerator(): void {
  UIClient.getInstance().stopAutomaticTransactionGenerator(props.hashId, props.connectorId);
}
</script>
