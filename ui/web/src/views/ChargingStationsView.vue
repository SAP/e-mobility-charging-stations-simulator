<template>
  <Container id="charging-stations">
    <Container id="buttons-container">
      <Button id="simulator-button" @click="startSimulator()">Start Simulator</Button>
      <Button id="simulator-button" @click="stopSimulator()">Stop Simulator</Button>
      <ReloadButton id="reload-button" :loading="state.isLoading" @click="load()" />
    </Container>
    <Container id="inputs-container">
      <input
        id="idtag-field"
        v-model="state.idTag"
        type="text"
        name="idtag-field"
        placeholder="RFID tag"
      />
    </Container>
    <CSTable :charging-stations="state.chargingStations" :id-tag="state.idTag" />
  </Container>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, reactive } from 'vue'
import CSTable from '@/components/charging-stations/CSTable.vue'
import type { ChargingStationData } from '@/types'
import Container from '@/components/Container.vue'
import ReloadButton from '@/components/buttons/ReloadButton.vue'
import Button from '@/components/buttons/Button.vue'

const UIClient = getCurrentInstance()?.appContext.config.globalProperties.$UIClient

onMounted(() => {
  UIClient.registerWSonOpenListener(load)
})

type State = {
  isLoading: boolean
  chargingStations: ChargingStationData[]
  idTag: string
}

const state: State = reactive({
  isLoading: false,
  chargingStations: [],
  idTag: ''
})

async function load(): Promise<void> {
  if (state.isLoading === false) {
    state.isLoading = true
    state.chargingStations = (await UIClient.listChargingStations())
      .chargingStations as ChargingStationData[]
    state.isLoading = false
  }
}

function startSimulator(): void {
  UIClient.startSimulator()
}
function stopSimulator(): void {
  UIClient.stopSimulator()
}
</script>

<style>
#charging-stations {
  height: fit-content;
  width: 100%;
  display: flex;
  flex-direction: column;
}

#buttons-container {
  display: flex;
  flex-direction: row;
}

#inputs-container {
  display: flex;
  flex-direction: row;
}

#reload-button {
  flex: auto;
  color: white;
  background-color: blue;
  font-size: 1.5rem;
  font-weight: bold;
  align-items: center;
  justify-content: center;
}

#reload-button:hover {
  background-color: rgb(0, 0, 225);
}

#reload-button:active {
  background-color: red;
}

#simulator-button {
  flex: auto;
}

#idtag-field {
  flex: auto;
  font-size: 1.5rem;
  text-align: center;
}
</style>
