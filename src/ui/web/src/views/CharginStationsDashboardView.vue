<template>
  <Container id="dash">
    <ReloadButton
      id="reload-button"
      :loading="isLoading"
      @click="load()"
    />
    <CSList :chargingStations="chargingStations" id="list"/>
  </Container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import CentralServer from '@/composable/CentralServer';

import Container from '@/components/Container.vue';
import ReloadButton from '@/components/ReloadButton.vue';
import CSList from '@/components/charging-stations/CSList.vue';

let isLoading = ref<boolean>(false);
let chargingStations = ref<Array<Record<string, unknown>>>(new Array());

function load() {
  isLoading.value = true;
  CentralServer.listChargingStations()
  .then((list) => {
    isLoading.value = false;
    // chargingStations.value.concat(list);
    chargingStations.value = list;
  });
}
</script>

<style>
#dash {
  height: 100%;
  width: 100%;
  padding: 30px;
  flex-direction: column;
  gap: 1%;
  /* background-color: black; */
  background-color: rgb(233, 227, 227);
}

#reload-button {
  width:100%;
}

#list {
  flex-grow: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  /* background-color: pink; */
  background-color: white;
  /* border: 5px solid black; */
}
</style> 
