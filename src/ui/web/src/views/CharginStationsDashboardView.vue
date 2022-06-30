<template>
  <Container id="dash">
    <ReloadButton
      id="reload-button"
      :loading="EMobility.isWaitingValue"
      @click="load()"
    />
    <CSList id="list"/>
  </Container>
  <!-- <ReloadButton
    id="reload-button"
    :loading="EMobility.isWaitingValue"
    @click="load()"
  />
  <br/>
  <br/>
  <br/>
  <ReloadButton
    id="reload-button"
    :loading="EMobility.isWaitingValue"
    @click="load()"
  />
  <br/>
  <ReloadButton
    id="reload-button"
    :loading="EMobility.isWaitingValue"
    @click="load()"
  /> -->
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import EMobility from '@/composable/EMobility';

import CSList from '@/components/charging-stations/CSList.vue';
import ReloadButton from '@/components/ReloadButton.vue';
import Container from '@/components/Container.vue';

onMounted(() => {
  // load();
});

function load() {
  EMobility.listChargingStations();
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
