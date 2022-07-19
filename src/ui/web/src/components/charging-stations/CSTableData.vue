<template>
  <tr v-for="connector in getNumberOfConnector()" class="cs-table__row">
    <td class="cs-table__data">
      <Button @click="startTransaction(connector)">Start Transaction</Button>
      <Button @click="stopTransaction(connector)">Stop Transaction</Button>
    </td>
    <td class="cs-table__data">{{ getID() }}</td>
    <td class="cs-table__data">{{ connector }}</td>
    <td class="cs-table__data">{{ getModel() }}</td>
    <td class="cs-table__data">{{ getVendor() }}</td>
    <td class="cs-table__data">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
import CentralServer from '@/composable/CentralServer';
import Button from '../buttons/Button.vue';

const props = defineProps<{
  chargingStation: Record<string, unknown>
}>();

function getHashId(): string {
  return props.chargingStation['hashId'] as string;
}

function getData(): Record<string, unknown> {
  return props.chargingStation['data'] as Record<string, unknown>;
}

function getID(): string {
  return getData()['id'] as string;
}

function getInfo(): Record<string, unknown> {
  return getData()['stationInfo'] as Record<string, unknown>;
}

function getModel(): string {
  return getInfo()['chargePointModel'] as string;
}

function getVendor(): string {
  return getInfo()['chargePointVendor'] as string;
}

function getFirmwareVersion(): string {
  const firmwareVersion = getInfo()['firmwareVersion'] as string;
  if (typeof firmwareVersion === 'undefined') return 'Ø';
  return firmwareVersion;
}

function getNumberOfConnector(): number {
  return getInfo()['numberOfConnectors'] as number;
}

function startTransaction(connectorId: number): void {
  CentralServer.startTransaction(getHashId(), connectorId, 'TEST');
}

function stopTransaction(connectorId: number): void {
  CentralServer.stopTransaction(getHashId(), connectorId);
}
</script>
