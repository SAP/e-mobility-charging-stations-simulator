<template>
  <div class="charging-station-container">
    <CSButtonView
      v-for="chargingStation in chargingStations"
      :data="(chargingStation['data'] as Record<string, unknown>)"
    />
  </div>
</template>

<script setup lang="ts">
import CSButtonView from '@/components/charging-stations/CSButtonView.vue';

const props = defineProps<{
  chargingStations: Record<string, unknown>[]
}>();
</script>

<style>
.charging-station-container {
  display: flex;
  flex-direction: column;
  /* flex-wrap: wrap;
  align-content: flex-start; */
  /* justify-content: space-evenly; */
  /* justify-content: flex-start; */
  gap: 1%;
  overflow-y: auto;
}
</style>
