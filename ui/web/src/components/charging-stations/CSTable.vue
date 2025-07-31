<template>
  <table id="cs-table">
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th
          class="cs-table__column"
          scope="col"
        >
          Name
        </th>
        <th
          class="cs-table__column cs-table__column-with-actions"
          scope="col"
        >
          Started
        </th>
        <th
          class="cs-table__column cs-table__column-with-actions"
          scope="col"
        >
          Supervision Url
        </th>
        <th
          class="cs-table__column cs-table__column-with-actions"
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
          Charger Details
        </th>
        <th
          class="cs-table__column cs-table__column-with-actions"
          scope="col"
        />
        <th
          class="cs-table__column"
          scope="col"
        >
          Connector(s)
        </th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSData
        v-for="chargingStation in chargingStations"
        :key="chargingStation.stationInfo.hashId"
        :charging-station="chargingStation"
        @need-refresh="$emit('need-refresh')"
      />
    </tbody>
  </table>
</template>

<script setup lang="ts">
import type { ChargingStationData } from '@/types'

import CSData from '@/components/charging-stations/CSData.vue'

defineProps<{
  chargingStations: ChargingStationData[]
}>()

const $emit = defineEmits(['need-refresh'])
</script>

<style>
#cs-table {
  width: 100%;
  background-color: white;
  border-collapse: collapse;
  empty-cells: show;
  table-layout: auto;
}

#cs-table__body {
  width: 100%;
}

#cs-table__caption {
  color: ivory;
  background-color: black;
  font-size: 1.5rem;
  font-weight: bold;
  padding: 0.5rem;
}

.cs-table__row {
  border: solid 0.25px black;
}

.cs-table__column {
  height: fit-content;
  display: flex;
  flex-direction: column;
  text-align: left;
}

.cs-table__column-with-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cs-table__connectors-column {
  height: fit-content;
  display: flex;
  flex-direction: column;
}
</style>
