<template>
  <FlatButton class="charging_stations" @click="show()">{{ data.id }}</FlatButton>
  <CSInfoModal :info="props.data['stationInfo']" :isVisible="isVisible" @close="hide()" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import FlatButton from '@/components/buttons/FlatButton.vue';
import CSInfoModal from './CSInfoModal.vue';

const props = defineProps<{
  data: Record<string, unknown>
}>();

const isVisible = ref(false);
function show() {
  isVisible.value = true;
}
function hide() {
  isVisible.value = false;
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
