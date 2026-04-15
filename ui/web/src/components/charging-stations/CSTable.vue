<template>
  <div class="cs-table__wrapper">
    <table class="cs-table">
      <caption class="cs-table__caption">
        Charging Stations
      </caption>
      <colgroup>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col class="cs-table__col--connectors">
      </colgroup>
      <thead class="cs-table__head">
        <tr class="cs-table__row">
          <th
            class="cs-table__column"
            scope="col"
          >
            Name
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Started
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Supervision Url
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            WebSocket State
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Registration Status
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            OCPP Version
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Template
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Vendor
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Model
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Firmware
          </th>
          <th
            class="cs-table__column"
            scope="col"
          >
            Actions
          </th>
          <th
            class="cs-table__connectors-column"
            scope="col"
          >
            Connector(s)
          </th>
        </tr>
      </thead>
      <tbody class="cs-table__body">
        <CSData
          v-for="chargingStation in chargingStations"
          :key="chargingStation.stationInfo.hashId"
          :charging-station="chargingStation"
          @need-refresh="$emit('need-refresh')"
        />
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { ChargingStationData } from '@/types/ChargingStationType'

import CSData from '@/components/charging-stations/CSData.vue'

defineProps<{
  chargingStations: ChargingStationData[]
}>()

const $emit = defineEmits(['need-refresh'])
</script>

<style scoped>
.cs-table__wrapper {
  overflow-x: auto;
}

.cs-table {
  width: 100%;
  table-layout: fixed;
  background-color: var(--color-bg-surface);
  border: solid 0.25px var(--color-border);
  border-collapse: collapse;
  empty-cells: show;
}

.cs-table__caption {
  color: var(--color-text-strong);
  background-color: var(--color-bg-caption);
  font-size: 1.5rem;
  font-weight: bold;
  padding: 0.5rem;
}

.cs-table__head .cs-table__row {
  background-color: var(--color-bg-header);
}

:deep(.cs-table__row) {
  border: solid 0.25px var(--color-border-row);
}

:deep(.cs-table__row:nth-of-type(even)) {
  background-color: var(--color-bg-hover);
}

:deep(.cs-table__column) {
  text-align: center;
  vertical-align: middle;
  padding: 0.25rem;
  overflow-wrap: break-word;
}

.cs-table__col--connectors {
  width: 33%;
}

:deep(.cs-table__connectors-column) {
  vertical-align: top;
  padding: 0;
}
</style>
