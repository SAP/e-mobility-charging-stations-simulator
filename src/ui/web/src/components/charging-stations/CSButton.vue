<template>
  <FlatButton class="charging_stations" @click="show()">{{ props.id }}</FlatButton>
  <CSInfo :info="info" :show="isShown" @close="hide()" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import FlatButton from '@/components/buttons/FlatButton.vue';
import CSInfo from './CSInfo.vue';

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
