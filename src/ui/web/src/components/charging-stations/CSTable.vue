<template>
  <table id="cs-table">
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th scope="col" class="cs-table__header">Action</th>
        <th scope="col" class="cs-table__header">Connector</th>
        <th scope="col" class="cs-table__header">Name</th>
        <th scope="col" class="cs-table__header">Model</th>
        <th scope="col" class="cs-table__header">Vendor</th>
        <th scope="col" class="cs-table__header">Firmware Version</th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSTableData v-for="chargingStation in chargingStations" :charging-station="chargingStation"/>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import CSTableData from './CSTableData.vue';

const props = defineProps<{
  chargingStations: Array<Record<string, unknown>>
}>();
</script>

<style>
#cs-table {
  flex-grow: 1;

  background-color: white;
  
  height:100%;
  width: 100%;

  /* display: block; */
  display: flex;
  flex-direction: column;
  overflow: auto hidden;
  border-collapse: collapse;
  white-space: nowrap;
  empty-cells: show;
}

#cs-table__head {
  /* position: sticky; */
  /* box-sizing: border-box; */
  /* top: 0; */
  /* border-style: solid; */

  display: block;
}

#cs-table__body {
  /* box-sizing: border-box; */
  /* border-style: none solid solid; */
  overflow: hidden auto;
  max-width: 100%;

  display: block;
  flex-grow: 1;
}

.cs-table__row {
  display:block;
}

#cs-table__head .cs-table__row {
  background-color: rgb(194, 188, 188);
}

.cs-table__row:nth-of-type(even) {
  background-color: rgb(223, 217, 217);
}

.cs-table__header {
  /* padding-left:  1em;
  padding-right: 1em; */
}

.cs-table__data {
  /* text-align: center; */
}

.cs-table__header, .cs-table__data {
  /* border-right-style: solid; */
  /* padding-top: 0.5em; */
  height: 2em;
  width: 20em;
  min-width: 16.7%;

  display: table-cell;
  text-align: center;
  vertical-align: middle;
}
</style>
