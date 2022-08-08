<template>
  <!-- <tr class="cs-table__row"> -->
  <td class="cs-table__data">
    <Button @click="getTag(startTransaction)">Start Transaction</Button>
    <TagInputModal
      :visibility="state.isTagModalVisible"
      :tag="state.tag"
      @close="hideTagModal()"
      @done="Utils.compose(state.transaction, hideTagModal)()"
    >
      Start Charging Session
    </TagInputModal>
    <Button @click="getTag(stopTransaction)">Stop Transaction</Button>
  </td>
  <td class="cs-table__data">{{ connectorId }}</td>
  <td class="cs-table__data">{{ connector.bootStatus }}</td>
</template>

<script setup lang="ts">
import TagInputModal from './TagInputModal.vue';
import Button from '../buttons/Button.vue';

import { reactive } from 'vue';
import UIClient from '@/composable/UIClient';
import { ConnectorStatus } from '@/type/SimulatorUI';
import Utils from '@/composable/Utils';

const props = defineProps<{
  hashId: string;
  connector: ConnectorStatus;
  connectorId: number;
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
  UIClient.instance.startTransaction(props.hashId, props.connectorId, state.tag);
}
function stopTransaction(): void {
  UIClient.instance.stopTransaction(props.hashId, props.connectorId);
}
</script>
