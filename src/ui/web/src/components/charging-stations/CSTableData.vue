<template>
  <tr v-for="(connector, index) in getConnectors()" class="cs-table__row">
    <td class="cs-table__data">
      <Button @click="startTransaction(index)">Start Transaction</Button>
      <Button @click="stopTransaction(index)">Stop Transaction</Button>
    </td>
    <td class="cs-table__data">{{ getID() }}</td>
    <td class="cs-table__data">{{ index + 1 }}</td>
    <td class="cs-table__data">{{ connector.bootStatus }}</td>
    <td class="cs-table__data">{{ getModel() }}</td>
    <td class="cs-table__data">{{ getVendor() }}</td>
    <td class="cs-table__data">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
import Button from '@/components/buttons/Button.vue';
import CentralServer from '@/composable/CentralServer';
import Utils from '@/composable/Utils';
import { SimulatorUI, ChargingStationInfoUI, ConnectorStatus } from '@/type/SimulatorUI';

const props = defineProps<{
  chargingStation: SimulatorUI
}>();

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

function getNumberOfConnector(): number {
  return getInfo()['numberOfConnectors'] as number;
}

function startTransaction(connectorId: number): void {
  CentralServer.startTransaction(getHashId(), connectorId + 1, 'TEST');
}

function stopTransaction(connectorId: number): void {
  CentralServer.stopTransaction(getHashId(), connectorId + 1);
}
</script>
