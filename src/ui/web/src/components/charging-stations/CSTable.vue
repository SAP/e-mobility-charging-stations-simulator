<template>
  <table id="cs-table">
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th scope="col" class="cs-table__action-col">Action</th>
        <th scope="col" class="cs-table__connector-col">Connector</th>
        <th scope="col" class="cs-table__status-col">Status</th>
        <th scope="col" class="cs-table__name-col">Name</th>
        <th scope="col" class="cs-table__model-col">Model</th>
        <th scope="col" class="cs-table__vendor-col">Vendor</th>
        <th scope="col" class="cs-table__firmware-col">Firmware Version</th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSData
        v-for="chargingStation in chargingStations"
        :key="chargingStation.hashId"
        :charging-station="chargingStation"
        :tag="props.tag"
      />
    </tbody>
  </table>
</template>

<script setup lang="ts">
import CSData from './CSData.vue';
import { ChargingStationData } from '@/type/ChargingStationType';

const props = defineProps<{
  chargingStations: ChargingStationData[];
  tag: string;
}>();
</script>

<style>
#cs-table {
  flex-grow: 1;

  background-color: white;

  height: 100%;
  width: 100%;

  display: flex;
  flex-direction: column;
  overflow: auto hidden;
  border-collapse: collapse;
  empty-cells: show;
}

#cs-table__head,
#cs-table__body {
  display: block;
  /* flex-direction: column;
  justify-content: space-evenly; */
  width: 100%;
  min-width: 934px;
  /* box-sizing: border-box; */
}
#cs-table__head {
  /* width: 100%; */
  /* display: block; */
}
#cs-table__body {
  /* width: 100%; */
  /* direction: rtl; */
  /* overflow: visible scroll; */
  overflow: visible overlay;
  flex-grow: 1;
}

.cs-table__row {
  /* width: 1647px; */
  width: 100%;
  /* display: inline-block; */
  display: flex;
  /* align-content: stretch; */
  /* align-items: baseline; */
}
#cs-table__head .cs-table__row {
  background-color: rgb(194, 188, 188);
}
.cs-table__row:nth-of-type(even) {
  background-color: rgb(223, 217, 217);
}

.cs-table__action-col,
.cs-table__connector-col,
.cs-table__status-col,
.cs-table__name-col,
.cs-table__model-col,
.cs-table__vendor-col,
.cs-table__firmware-col {
  /* height: 2em; */
  width: 14.3%;
  padding-top: 0.5em;
  /* background-color: red; */
  /* width: 14.3%; */
  text-align: center;
  /* display: table-cell;
  vertical-align: middle; */
}
.cs-table__action-col {
  /* min-width: 200px; */
}
.cs-table__connector-col {
  /* min-width: 120px; */
}
.cs-table__status-col {
  /* min-width: 120px; */
}
.cs-table__name-col {
  /* min-width: 120px; */
}
.cs-table__model-col {
  /* min-width: 120px; */
}
.cs-table__vendor-col {
  /* min-width: 120px; */
}
.cs-table__firmware-col {
  /* min-width: 120px; */
}
</style>
