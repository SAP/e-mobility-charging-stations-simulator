<template>
  <Container id="charging-stations">
    <Container id="buttons-container">
      <Button id="simulator-button" @click="startSimulator()">Start Simulator</Button>
      <Button id="simulator-button" @click="stopSimulator()">Stop Simulator</Button>
      <ReloadButton id="reload-button" :loading="state.isLoading" @click="loadChargingStations()" />
    </Container>
    <CSTable
      :charging-stations="
        getCurrentInstance()?.appContext.config.globalProperties.$chargingStations ?? []
      "
    />
  </Container>
</template>

<script setup lang="ts">
import { getCurrentInstance, reactive } from 'vue'
import CSTable from '@/components/charging-stations/CSTable.vue'
import type { ResponsePayload } from '@/types'
import Container from '@/components/Container.vue'
import ReloadButton from '@/components/buttons/ReloadButton.vue'
import Button from '@/components/buttons/Button.vue'

const state = reactive({
  isLoading: false
})

const app = getCurrentInstance()
const uiClient = app?.appContext.config.globalProperties.$uiClient

function loadChargingStations(): void {
  if (state.isLoading === false) {
    state.isLoading = true
    uiClient
      .listChargingStations()
      .then((response: ResponsePayload) => {
        if (app != null) {
          app.appContext.config.globalProperties.$chargingStations = response.chargingStations
        }
      })
      .catch((error: Error) => {
        // TODO: add code for UI notifications or other error handling logic
        console.error('Error at fetching charging stations:', error)
      })
      .finally(() => {
        state.isLoading = false
      })
  }
}

function startSimulator(): void {
  uiClient.startSimulator()
}
function stopSimulator(): void {
  uiClient.stopSimulator()
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
</style>
