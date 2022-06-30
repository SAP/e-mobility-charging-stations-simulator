<template>
  <div class="charging-station-container">
    <CSButton
      v-for="chargingStation in EMobility.chargingStations.value"
      :id="chargingStation['id']"
      :info="chargingStation['stationInfo']"
    />
  </div>
</template>

<script setup lang="ts">
import EMobility from '@/composable/EMobility';
import CSButton from '@/components/charging-stations/CSButton.vue';
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
