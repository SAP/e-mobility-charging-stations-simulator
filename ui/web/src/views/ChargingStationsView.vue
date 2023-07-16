<template>
  <Container id="charging-stations">
    <Button id="simulator-button" @click="startSimulator()">Start Simulator</Button>
    <Button id="simulator-button" @click="stopSimulator()">Stop Simulator</Button>
    <Container id="inputs-container">
      <input
        id="idtag-field"
        v-model="state.idTag"
        type="text"
        name="idtag-field"
        placeholder="RFID tag"
      />
      <ReloadButton id="reload-button" :loading="state.isLoading" @click="load()" />
    </Container>
    <CSTable :charging-stations="state.chargingStations" :id-tag="state.idTag" />
  </Container>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import CSTable from '@/components/charging-stations/CSTable.vue';
import type { ChargingStationData } from '@/types';
import Container from '@/components/Container.vue';
import ReloadButton from '@/components/buttons/ReloadButton.vue';
import { UIClient } from '@/composables/UIClient';

const UIClientInstance = UIClient.getInstance();

onMounted(() => {
  UIClientInstance.registerWSonOpenListener(load);
});

type State = {
  isLoading: boolean;
  chargingStations: ChargingStationData[];
  idTag: string;
};

const state: State = reactive({
  isLoading: false,
  chargingStations: [],
  idTag: '',
});

async function load(): Promise<void> {
  if (state.isLoading === true) return;
  state.isLoading = true;
  const listChargingStationsPayload = await UIClientInstance.listChargingStations();
  state.chargingStations =
    listChargingStationsPayload.chargingStations as unknown as ChargingStationData[];
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
  padding: 5px 15px;
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
