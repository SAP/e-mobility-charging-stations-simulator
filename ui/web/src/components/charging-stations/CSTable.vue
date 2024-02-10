<template>
  <table id="cs-table">
    <caption id="cs-table__caption">
      Charging Stations
    </caption>
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th scope="col" class="cs-table__column">Action</th>
        <th scope="col" class="cs-table__column">Connector</th>
        <th scope="col" class="cs-table__column">Status</th>
        <th scope="col" class="cs-table__column">Transaction</th>
        <th scope="col" class="cs-table__column">Name</th>
        <th scope="col" class="cs-table__column">Started</th>
        <th scope="col" class="cs-table__column">Supervision Url</th>
        <th scope="col" class="cs-table__column">WebSocket State</th>
        <th scope="col" class="cs-table__column">Registration Status</th>
        <th scope="col" class="cs-table__column">Template</th>
        <th scope="col" class="cs-table__column">Vendor</th>
        <th scope="col" class="cs-table__column">Model</th>
        <th scope="col" class="cs-table__column">Firmware Version</th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSData
        v-for="chargingStation in props.chargingStations"
        :key="chargingStation.stationInfo?.hashId"
        :charging-station="chargingStation"
        :id-tag="props.idTag"
      />
    </tbody>
  </table>
</template>

<script setup lang="ts">
import CSData from './CSData.vue'
import type { ChargingStationData } from '@/types'

const props = defineProps<{
  chargingStations: ChargingStationData[]
  idTag: string
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

#cs-table__head,
#cs-table__body {
  height: fit-content;
  width: 100%;
  display: flex;
  flex-direction: column;
}

#cs-table__body {
  overflow: visible overlay;
}

#cs-table__caption {
  font-size: 1.5rem;
  font-weight: bold;
  padding: 0.5rem;
}

.cs-table__row {
  height: fit-content;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

#cs-table__head .cs-table__row {
  background-color: rgb(194, 188, 188);
}

.cs-table__row:nth-of-type(even) {
  background-color: rgb(223, 217, 217);
}

.cs-table__column {
  height: fit-content;
  width: calc(100% / 13);
  text-align: center;
}
</style>
