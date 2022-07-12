<template>
  <tr class="cs-table__row">
    <td class="cs-table__data">{{ getID() }}</td>
    <td class="cs-table__data">{{ getModel() }}</td>
    <td class="cs-table__data">{{ getVendor() }}</td>
    <td class="cs-table__data">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
const props = defineProps<{
  chargingStation: Record<string, unknown>
}>();

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
</script>