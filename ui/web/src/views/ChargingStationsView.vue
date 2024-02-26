<template>
  <Container id="charging-stations-container">
    <Container id="ui-server-container">
      <select
        v-show="Array.isArray(uiServerConfigurations) && uiServerConfigurations.length > 1"
        id="ui-server-selector"
        v-model="state.uiServerIndex"
        @change="
          () => {
            try {
              if (
                getFromLocalStorage<number>('uiServerConfigurationIndex', 0) !== state.uiServerIndex
              ) {
                setToLocalStorage<number>('uiServerConfigurationIndex', state.uiServerIndex)
                app!.appContext.config.globalProperties.$uiClient.setConfiguration(
                  app?.appContext.config.globalProperties.$configuration.uiServer[
                    getFromLocalStorage<number>('uiServerConfigurationIndex', state.uiServerIndex)
                  ]
                )
              }
            } catch (error) {
              $toast.error('Error at changing UI server configuration')
              console.error('Error at changing UI server configuration:', error)
            }
          }
        "
      >
        <option
          v-for="uiServerConfiguration in uiServerConfigurations"
          :value="uiServerConfiguration.index"
        >
          {{ uiServerConfiguration.configuration.host }}
        </option>
      </select>
    </Container>
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
      v-show="
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
import type { ResponsePayload, UIServerConfigurationSection } from '@/types'
import Container from '@/components/Container.vue'
import ReloadButton from '@/components/buttons/ReloadButton.vue'
import Button from '@/components/buttons/Button.vue'
import { getFromLocalStorage, setToLocalStorage } from '@/composables'

const state = reactive({
  isLoading: false,
  uiServerIndex: getFromLocalStorage<number>('uiServerConfigurationIndex', 0)
})

const app = getCurrentInstance()
const uiClient = app?.appContext.config.globalProperties.$uiClient
const uiServerConfigurations: { configuration: UIServerConfigurationSection; index: number }[] =
  app?.appContext.config.globalProperties.$configuration.uiServer.map(
    (configuration: UIServerConfigurationSection, index: number) => ({
      configuration,
      index
    })
  )

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
  display: flex;
  flex-direction: column;
}

#ui-server-container {
  display: flex;
  flex-direction: row;
}

#ui-server-selector {
  width: 100%;
  text-align: center;
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
