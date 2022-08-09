<template>
  <tr v-for="(connector, index) in getConnectors()" class="cs-table__row">
    <CSConnector :hash-id="getHashId()" :connector="connector" :connector-id="index + 1" />
    <td class="cs-table__data">{{ getID() }}</td>
    <td class="cs-table__data">{{ getModel() }}</td>
    <td class="cs-table__data">{{ getVendor() }}</td>
    <td class="cs-table__data">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
import CSConnector from './CSConnector.vue';

import { reactive } from 'vue';
import Utils from '@/composable/Utils';
import { SimulatorUI, ChargingStationInfoUI, ConnectorStatus } from '@/type/SimulatorUI';

const props = defineProps<{
  chargingStation: SimulatorUI;
}>();

type State = {
  isTagModalVisible: boolean;
  tag: string;
};
const state: State = reactive({
  isTagModalVisible: false,
  tag: '',
});

function getHashId(): string {
  return props.chargingStation.hashId;
}
function getConnectors(): Array<ConnectorStatus> {
  return props.chargingStation.connectors.slice(1);
}
function getInfo(): ChargingStationInfoUI {
  return props.chargingStation.stationInfo;
}
function getID(): string {
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
function hideTagModal(): void {
  state.isTagModalVisible = false;
}
</script>
