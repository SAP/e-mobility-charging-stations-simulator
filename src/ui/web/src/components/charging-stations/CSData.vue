<template>
  <tr v-for="(connector, index) in getConnector()" class="cs-table__row">
    <CSConnector
      :hash-id="getHashId()"
      :connector="connector"
      :connector-id="index + 1"
      :tag="props.tag"
    />
    <td class="cs-table__name-col">{{ getChargingStationId() }}</td>
    <td class="cs-table__model-col">{{ getModel() }}</td>
    <td class="cs-table__vendor-col">{{ getVendor() }}</td>
    <td class="cs-table__firmware-col">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
import CSConnector from './CSConnector.vue';

import { reactive } from 'vue';
import Utils from '@/composable/Utils';
import {
  ChargingStationData,
  ChargingStationInfo,
  ConnectorStatus,
} from '@/type/ChargingStationType';

const props = defineProps<{
  chargingStation: ChargingStationData;
  tag: string;
}>();

type State = {
  isTagModalVisible: boolean;
  // tag: string;
};
const state: State = reactive({
  isTagModalVisible: false,
  // tag: '',
});

function getHashId(): string {
  return props.chargingStation.hashId;
}
function getConnector(): Array<ConnectorStatus> {
  return props.chargingStation.connectors.slice(1);
}
function getInfo(): ChargingStationInfo {
  return props.chargingStation.stationInfo;
}
function getChargingStationId(): string {
  return Utils.ifUndefined<string>(getInfo().chargingStationId, 'Ø');
}
function getModel(): string {
  return getInfo().chargePointModel;
}
function getVendor(): string {
  return getInfo().chargePointVendor;
}
function getFirmwareVersion(): string {
  return Utils.ifUndefined<string>(getInfo().firmwareVersion, 'Ø');
}

// function showTagModal(): void {
//   state.isTagModalVisible = true;
// }
// function hideTagModal(): void {
//   state.isTagModalVisible = false;
// }
</script>
