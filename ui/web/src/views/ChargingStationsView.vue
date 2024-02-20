<template>
  <Container id="charging-stations-container">
    <Container id="buttons-container">
      <Button @click="startSimulator()">Start Simulator</Button>
      <Button @click="stopSimulator()">Stop Simulator</Button>
      <Button @click="$router.push({ name: 'add-charging-stations' })">
        Add Charging Stations
      </Button>
      <ReloadButton
        id="reload-button"
        :loading="state.isLoading"
        @click="loadChargingStations(() => $router.go(0))"
      />
    </Container>
    <CSTable
      v-if="
        Array.isArray(app?.appContext.config.globalProperties.$chargingStations) &&
        app?.appContext.config.globalProperties.$chargingStations.length > 0
      "
      :charging-stations="app?.appContext.config.globalProperties.$chargingStations"
    />
  </Container>
</template>

<script setup lang="ts">
import { getCurrentInstance, reactive } from 'vue'
import { useToast } from 'vue-toast-notification'
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

const $toast = useToast()

const loadChargingStations = (reloadCallback?: () => void): void => {
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
        $toast.error('Error at fetching charging stations')
        console.error('Error at fetching charging stations:', error)
      })
      .finally(() => {
        if (reloadCallback != null) {
          reloadCallback()
        }
        state.isLoading = false
      })
  }
}

const startSimulator = (): void => {
  uiClient
    .startSimulator()
    .then(() => {
      $toast.success('Simulator successfully started')
    })
    .catch((error: Error) => {
      $toast.error('Error at starting simulator')
      console.error('Error at starting simulator:', error)
    })
}
const stopSimulator = (): void => {
  uiClient
    .stopSimulator()
    .then(() => {
      if (app != null) {
        app.appContext.config.globalProperties.$chargingStations = []
      }
      $toast.success('Simulator successfully stopped')
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping simulator')
      console.error('Error at stopping simulator:', error)
    })
}
</script>

<style>
#charging-stations-container {
  height: fit-content;
  width: 100%;
  position: absolute;
  display: flex;
  flex-direction: column;
}

#buttons-container {
  display: flex;
  flex-direction: row;
}

#action-button {
  flex: none;
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

#action {
  color: white;
  background-color: black;
  padding: 1%;
}
</style>
