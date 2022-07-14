<template>
  <table id="cs-table">
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th scope="col" class="cs-table__header">Name</th>
        <th scope="col" class="cs-table__header">Model</th>
        <th scope="col" class="cs-table__header">Vendor</th>
        <th v-for="n in 1" scope="col" class="cs-table__header">Firmware Version</th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSTableData v-for="chargingStation in chargingStations" :charging-station="chargingStation"/>
      <!-- <tr :id="n" v-for="n in 50" class="cs-table__row">
        <td class="cs-table__data">truc</td>
        <td class="cs-table__data">muche</td>
        <td class="cs-table__data">machin</td>
        <td class="cs-table__data">bidule</td>
      </tr> -->
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
  flex: 1 0 0px;

  background-color: white;
  
  height:100%;
  max-width: 100%;

  display: block;
  overflow: auto;
  border-collapse: collapse;
  white-space: nowrap;
}

#cs-table__head {
  position: sticky;
  top: 0;
}

#cs-table__body {
  height: 100%;
  /* width: 100%; */
}

#cs-table__head .cs-table__row, .cs-table__row:nth-of-type(even) {
  background-color: rgb(194, 188, 188);
}

.cs-table__header, .cs-table__data {
  text-align: center;
  height: 2em;
}

.cs-table__header {
  padding-left:  1em;
  padding-right: 1em;
}

.cs-table__data {
  /* text-align: center; */
}
</style>
