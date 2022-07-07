<template>
<Modal :isVisible="isVisible">
  <div class="card-info">
    vendor: {{info['chargePointVendor']}}
  </div>
</Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal.vue';
import { onMounted } from 'vue';

const props = defineProps<{
  isVisible: boolean,
  info: any
}>();

</script>

<style>
.card-info {
  background-color: white;
  padding: 15px;
}
</style>
