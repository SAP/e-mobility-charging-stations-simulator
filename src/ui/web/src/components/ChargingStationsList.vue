<template>
  <div class="charging-station-container">
    <ChargingStations
      class="charging-station"
      v-for="chargingStation in EMobility.chargingStations.value"
      :id="chargingStation['id']"
      :info="chargingStation['stationInfo']"
    />
  </div>
</template>

<script setup lang="ts">
import EMobility from '@/composable/EMobility';
import ChargingStations from '@/components/ChargingStations.vue';
</script>

<style>
.charging-station-container {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  /* justify-content: space-evenly; */
  /* justify-content: flex-start; */
  gap: 1%;
  overflow-y: auto;
}
</style>
