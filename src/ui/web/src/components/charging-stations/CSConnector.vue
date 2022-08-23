<template>
  <td class="cs-table__action-col">
    <Button @click="startTransaction()">Start Transaction</Button>
    <!-- <TagInputModal
      :visibility="state.isTagModalVisible"
      :tag="state.tag"
      @close="hideTagModal()"
      @done="Utils.compose(state.transaction, hideTagModal)()"
    >
      Start Charging Session
    </TagInputModal> -->
    <!-- TODO: Use transactionId to stop transaction -->
    <!-- <Button @click="stopTransaction()">Stop Transaction</Button> -->
  </td>
  <td class="cs-table__connector-col">{{ connectorId }}</td>
  <td class="cs-table__status-col">{{ connector.bootStatus }}</td>
</template>

<script setup lang="ts">
import TagInputModal from './TagInputModal.vue';
import Button from '../buttons/Button.vue';

import { reactive } from 'vue';
import UIClient from '@/composable/UIClient';
import { ConnectorStatus } from '@/type/ChargingStationType';
import Utils from '@/composable/Utils';

const props = defineProps<{
  hashId: string;
  connector: ConnectorStatus;
  transactionId?: number;
  connectorId?: number;
  tag?: string;
}>();

type State = {
  isTagModalVisible: boolean;
  tag: string;
  transaction: () => void;
};
const state: State = reactive({
  isTagModalVisible: false,
  tag: '',
  transaction: startTransaction,
});

function getTag(transaction: () => void): void {
  state.transaction = transaction;
  showTagModal();
}

function showTagModal(): void {
  state.isTagModalVisible = true;
}
function hideTagModal(): void {
  state.isTagModalVisible = false;
}

function startTransaction(): void {
  UIClient.instance.startTransaction(props.hashId, props.connectorId, props.tag);
}
function stopTransaction(): void {
  UIClient.instance.stopTransaction(props.hashId, props.transactionId);
}
</script>
