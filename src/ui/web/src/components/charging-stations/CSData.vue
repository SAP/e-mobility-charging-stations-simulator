<template>
  <tr v-for="(connector, index) in getConnectors()" class="cs-table__row">
    <CSConnector
      :hash-id="getHashId()"
      :connector="connector"
      :connector-id="index + 1"
      :transaction-id="connector.transactionId"
      :id-tag="props.idTag"
    />
    <td class="cs-table__name-col">{{ getId() }}</td>
    <td class="cs-table__started-col">{{ getStarted() }}</td>
    <td class="cs-table__wsState-col">{{ getWsState() }}</td>
    <td class="cs-table__registration-status-col">{{ getRegistrationStatus() }}</td>
    <td class="cs-table__vendor-col">{{ getVendor() }}</td>
    <td class="cs-table__model-col">{{ getModel() }}</td>
    <td class="cs-table__firmware-col">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
import CSConnector from './CSConnector.vue';

// import { reactive } from 'vue';
import Utils from '@/composables/Utils';
import type {
  ChargingStationData,
  ChargingStationInfo,
  ConnectorStatus,
} from '@/types/ChargingStationType';

const props = defineProps<{
  chargingStation: ChargingStationData;
  idTag: string;
}>();

// type State = {
//   isTagModalVisible: boolean;
//   idTag: string;
// };

// const state: State = reactive({
//   isTagModalVisible: false,
//   idTag: '',
// });

function getConnectors(): ConnectorStatus[] {
  return props.chargingStation.connectors?.slice(1);
}
function getInfo(): ChargingStationInfo {
  return props.chargingStation.stationInfo;
}
function getHashId(): string {
  return getInfo().hashId;
}
function getId(): string {
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
function getStarted(): string {
  return props.chargingStation.started === true ? 'Yes' : 'No';
}
function getWsState(): string {
  switch (props.chargingStation?.wsState) {
    case WebSocket.CONNECTING:
      return 'Connecting';
    case WebSocket.OPEN:
      return 'Open';
    case WebSocket.CLOSING:
      return 'Closing';
    case WebSocket.CLOSED:
      return 'Closed';
    default:
      return 'Ø';
  }
}
function getRegistrationStatus(): string {
  return props.chargingStation?.bootNotificationResponse?.status ?? 'Ø';
}
// function showTagModal(): void {
//   state.isTagModalVisible = true;
// }
// function hideTagModal(): void {
//   state.isTagModalVisible = false;
// }
</script>
