<template>
  <Container id="charging-stations">
    <Container id="reload-button_tag-field">
      <input
        id="tag-field"
        type="text"
        name="tag-field"
        placeholder="Badge Authentication ID"
        v-model="state.tag"
      />
      <ReloadButton id="reload-button" :loading="state.isLoading" @click="load()" />
    </Container>
    <CSTable :chargingStations="state.chargingStations" :tag="state.tag" />
  </Container>
</template>

<script setup lang="ts">
import Container from '@/components/Container.vue';
import ReloadButton from '@/components/buttons/ReloadButton.vue';
import CSTable from '@/components/charging-stations/CSTable.vue';

import { onMounted, reactive } from 'vue';
import UIClient from '@/composable/UIClient';
import { SimulatorUI } from '@/type/SimulatorUI';

const client = UIClient.instance;

onMounted(() => {
  client.onOpen(load);
});

type State = {
  isLoading: boolean;
  chargingStations: SimulatorUI[];
  tag: string;
};

const state: State = reactive({
  isLoading: false,
  chargingStations: [],
  tag: '',
});

async function load(): Promise<void> {
  if (state.isLoading === true) return;
  state.isLoading = true;
  const list = await UIClient.instance.listChargingStations();
  state.chargingStations = list;
  // state.chargingStations = state.chargingStations.concat(state.chargingStations.concat(list));
  state.isLoading = false;
}
</script>

<style>
#charging-stations {
  height: 100%;
  width: 100%;
  padding: 30px;
  background-color: rgb(233, 227, 227);

  flex-direction: column;
  gap: 1%;
}

#reload-button {
  /* width: 100%; */
  padding: 6px 14px;
  background-color: rgb(25, 118, 210);
  border-radius: 5px;

  color: white;
  font-size: 35px;
  font-weight: bold;
}

#reload-button:hover {
  background-color: rgb(10, 113, 195);
}

#reload-button:active {
  background-color: rgb(255, 113, 195);
}

#reload-button_tag-field {
  display: flex;
  justify-content: space-between;
}

#tag-field {
  flex-grow: 1;
}
</style>
