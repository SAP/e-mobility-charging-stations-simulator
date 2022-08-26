<template>
  <Container id="charging-stations">
    <Button id="simulator-button" @click="startSimulator()">Start Simulator</Button>
    <Button id="simulator-button" @click="stopSimulator()">Stop Simulator</Button>
    <Container id="inputs-container">
      <input
        id="idtag-field"
        type="text"
        name="idtag-field"
        placeholder="RFID tag"
        v-model="state.idTag"
      />
      <ReloadButton id="reload-button" :loading="state.isLoading" @click="load()" />
    </Container>
    <CSTable :chargingStations="state.chargingStations" :idTag="state.idTag" />
  </Container>
</template>

<script setup lang="ts">
import Container from '@/components/Container.vue';
import ReloadButton from '@/components/buttons/ReloadButton.vue';
import CSTable from '@/components/charging-stations/CSTable.vue';

import { onMounted, reactive } from 'vue';
import UIClient from '@/composable/UIClient';
import { ChargingStationData } from '@/type/ChargingStationType';

const UIClientInstance = UIClient.instance;

onMounted(() => {
  UIClientInstance.registerWSonOpenListener(load);
});

type State = {
  isLoading: boolean;
  chargingStations: Record<string, ChargingStationData>;
  idTag: string;
};

const state: State = reactive({
  isLoading: false,
  chargingStations: {},
  idTag: '',
});

async function load(): Promise<void> {
  if (state.isLoading === true) return;
  state.isLoading = true;
  const list = await UIClientInstance.listChargingStations();
  state.chargingStations = list as unknown as Record<string, ChargingStationData>;
  state.isLoading = false;
}

function startSimulator(): void {
  UIClientInstance.startSimulator();
}
function stopSimulator(): void {
  UIClientInstance.stopSimulator();
}
</script>

<style>
#charging-stations {
  height: 100%;
  width: 100%;
  padding: 30px;
  background-color: rgb(233, 227, 227);
  display: flex;
  flex-direction: column;
  gap: 0.5%;
}

#inputs-container {
  display: flex;
  justify-content: space-between;
}

#reload-button {
  flex: auto;
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

#simulator-button {
  flex: auto;
}

#idtag-field {
  flex: auto;
}
</style>
