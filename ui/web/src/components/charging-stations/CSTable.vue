<template>
  <table id="cs-table">
    <caption id="cs-table__caption">
      Charging Stations
    </caption>
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th scope="col" class="cs-table__column">Name</th>
        <th scope="col" class="cs-table__column">Started</th>
        <th scope="col" class="cs-table__column">Supervision Url</th>
        <th scope="col" class="cs-table__column">WebSocket State</th>
        <th scope="col" class="cs-table__column">Registration Status</th>
        <th scope="col" class="cs-table__column">Template</th>
        <th scope="col" class="cs-table__column">Vendor</th>
        <th scope="col" class="cs-table__column">Model</th>
        <th scope="col" class="cs-table__column">Firmware</th>
        <th scope="col" class="cs-table__column">Actions</th>
        <th scope="col" class="cs-table__connectors-column">Connector(s)</th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSData
        v-for="chargingStation in chargingStations"
        :key="chargingStation.stationInfo?.hashId"
        :charging-station="chargingStation"
      />
    </tbody>
  </table>
</template>

<script setup lang="ts">
import CSData from '@/components/charging-stations/CSData.vue'
import type { ChargingStationData } from '@/types'

defineProps<{
  chargingStations: ChargingStationData[]
}>()
</script>

<style>
#cs-table {
  height: fit-content;
  width: 100%;
  background-color: white;
  display: flex;
  flex-direction: column;
  overflow: auto hidden;
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
  color: white;
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
}

.cs-table__row:nth-of-type(even) {
  background-color: whitesmoke;
}

.cs-table__column {
  height: fit-content;
  width: calc(65% / 10);
  text-align: center;
}

#cs-table__head .cs-table__row {
  background-color: lightgrey;
}

.cs-table__connectors-column {
  height: fit-content;
  width: 35%;
}
</style>
