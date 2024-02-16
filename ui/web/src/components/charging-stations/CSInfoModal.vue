<template>
  <Modal :visibility="props.isVisible">
    <div>vendor: {{ props.stationInfo.chargePointVendor }}</div>
  </Modal>
</template>

<script setup lang="ts">
import type { ChargingStationInfo } from '@/types'
import Modal from '@/components/Modal.vue'

const props = defineProps<{
  stationInfo: ChargingStationInfo
  isVisible: boolean
}>()
</script>
