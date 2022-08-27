<template>
  <Modal :visibility="props.isVisible">
    <div class="card-info">vendor: {{ props.info.chargePointVendor }}</div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal.vue';
import type { ChargingStationInfo } from '@/types/ChargingStationType';

const props = defineProps<{
  isVisible: boolean;
  info: ChargingStationInfo;
}>();
</script>

<style>
.card-info {
  background-color: white;
  padding: 15px;
}
</style>
