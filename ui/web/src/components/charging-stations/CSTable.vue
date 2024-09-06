<template>
  <table id="cs-table">
    <caption id="cs-table__caption">
      Charging Stations
    </caption>
    <thead id="cs-table__head">
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
  height: fit-content;
  width: 100%;
  background-color: white;
  display: flex;
  flex-direction: column;
  overflow: auto hidden;
  border: solid 0.25px black;
  border-collapse: collapse;
  empty-cells: show;
}

#cs-table__body {
  height: fit-content;
  width: 100%;
  display: flex;
  flex-direction: column;
}

#cs-table__caption {
  color: ivory;
  background-color: black;
  font-size: 1.5rem;
  font-weight: bold;
  padding: 0.5rem;
}

.cs-table__row {
  height: fit-content;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border: solid 0.25px black;
}

.cs-table__row:nth-of-type(even) {
  background-color: whitesmoke;
}

.cs-table__column {
  height: fit-content;
  width: calc((100% - calc(100% / 3)) / 10);
  display: flex;
  flex-direction: column;
  text-align: center;
}

#cs-table__head .cs-table__row {
  background-color: lightgrey;
}

.cs-table__connectors-column {
  height: fit-content;
  width: calc(100% / 3);
  display: flex;
  flex-direction: column;
}
</style>
