<template>
  <tbody id="cs-table__body">
    <CSTableData v-for="chargingStation in chargingStations" :chargingStation="chargingStation" />
    <!-- <tr v-for="n in 50" class="cs-table__row">
      <td class="cs-table__data">truc</td>
      <td class="cs-table__data">muche</td>
      <td class="cs-table__data">machin</td>
      <td class="cs-table__data">bidule</td>
    </tr> -->
  </tbody>
</template>

<script setup lang="ts">
import CSTableData from './CSTableData.vue';
const props = defineProps<{
  chargingStations: Array<Record<string, unknown>>
}>();
</script>