<template>
  <div>
    <FlatButton class="charging_stations" @click="show()">{{ props.id }}</FlatButton>
    <Modal :show="isShown" @close="hide()">
      <h2>Test</h2>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import FlatButton from './buttons/FlatButton.vue';
import Modal from '@/components/Modal.vue';

const props = defineProps(['id', 'info']);

const isShown = ref(false);
function show() {
  isShown.value = true;
}
function hide() {
  isShown.value = false;
}
</script>

<style>
.charging_stations {
  color: black;
  background-color: #E8E8E8;
  font-size: 20px;
}
.charging_stations:hover {
  background-color: #DCDCDC;
}
</style>
