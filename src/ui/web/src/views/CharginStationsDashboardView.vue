<template>
  <Container id="charging-stations">
    <ReloadButton
      id="reload-button"
      :loading="state.isLoading"
      @click="load()"
    />
    <CSTable :chargingStations="state.chargingStations" />
    <!-- <CSList :chargingStations="state.chargingStations" id="list"/> -->
  </Container>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import CentralServer from '@/composable/CentralServer';

import Container from '@/components/Container.vue';
import ReloadButton from '@/components/buttons/ReloadButton.vue';
import CSTable from '@/components/charging-stations/CSTable.vue';

onMounted(() => {
  load();
});

interface State {
  isLoading: boolean,
  chargingStations: Array<Record<string, unknown>>
}

const state: State = reactive({
  isLoading: false,
  chargingStations: []
});

async function load(): Promise<void> {
  if (state.isLoading === true) return;
  state.isLoading = true;
  const list = await CentralServer.listChargingStations();
  console.debug(list);
  state.chargingStations = state.chargingStations.concat(state.chargingStations.concat(list));
  // state.chargingStations = list;
  state.isLoading = false;
}
</script>

<style>
#charging-stations {
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
  /* flex-grow: 1; */
  height: 100;
  overflow-y: auto;
  scroll-behavior: smooth;
  background-color: white;
  /* background-color: pink; */
  /* border: 5px solid black; */
}
</style> 
