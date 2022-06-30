<template>
<Modal :show="show" @close="noop()">
  <div class="card-info">{{info['chargePointVendor']}}</div>
</Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal.vue';

const props = defineProps<{
  show: boolean,
  info: any
}>();

function noop() {
  console.log('test');
}

// const emit = defineEmits(['close']);

// function close() {
//   emit('close');
// }

</script>

<style>
.card-info {
  background-color: white;
}
</style>
