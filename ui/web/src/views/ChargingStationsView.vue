<template>
  <Container id="charging-stations-container">
    <Container id="buttons-container">
      <Container
        v-show="Array.isArray(uiServerConfigurations) && uiServerConfigurations.length > 1"
        id="ui-server-container"
      >
        <select
          id="ui-server-selector"
          v-model="state.uiServerIndex"
          @change="
            () => {
              if (
                getFromLocalStorage<number>('uiServerConfigurationIndex', 0) !== state.uiServerIndex
              ) {
                app?.appContext.config.globalProperties.$uiClient.setConfiguration(
                  app?.appContext.config.globalProperties.$configuration.uiServer[
                    state.uiServerIndex
                  ]
                )
                initializeWSEventListeners()
                app?.appContext.config.globalProperties.$uiClient.registerWSEventListener(
                  'open',
                  () => {
                    setToLocalStorage<number>('uiServerConfigurationIndex', state.uiServerIndex)
                    clearToggleButtons()
                    $router.currentRoute.value.name !== 'charging-stations' &&
                      $router.push({ name: 'charging-stations' })
                  },
                  { once: true }
                )
                app?.appContext.config.globalProperties.$uiClient.registerWSEventListener(
                  'error',
                  () => {
                    state.uiServerIndex = getFromLocalStorage<number>(
                      'uiServerConfigurationIndex',
                      0
                    )
                    app?.appContext.config.globalProperties.$uiClient.setConfiguration(
                      app?.appContext.config.globalProperties.$configuration.uiServer[
                        getFromLocalStorage<number>('uiServerConfigurationIndex', 0)
                      ]
                    )
                    initializeWSEventListeners()
                  },
                  { once: true }
                )
              }
            }
          "
        >
          <option
            v-for="uiServerConfiguration in uiServerConfigurations"
            :value="uiServerConfiguration.index"
          >
            {{
              uiServerConfiguration.configuration.name ?? uiServerConfiguration.configuration.host
            }}
          </option>
        </select>
      </Container>
      <ToggleButton
        :id="'simulator'"
        :key="state.renderSimulator"
        :status="state.simulatorState?.started"
        :on="() => startSimulator()"
        :off="() => stopSimulator()"
        :class="
          state.simulatorState?.started === true
            ? 'simulator-stop-button'
            : 'simulator-start-button'
        "
      >
        {{ state.simulatorState?.started === true ? 'Stop' : 'Start' }} Simulator
        {{ state.simulatorState?.version != null ? ` (${state.simulatorState?.version})` : '' }}
      </ToggleButton>
      <ToggleButton
        :id="'add-charging-stations'"
        :key="state.renderAddChargingStations"
        :shared="true"
        :on="
          () => {
            $router.push({ name: 'add-charging-stations' })
          }
        "
        :off="
          () => {
            $router.push({ name: 'charging-stations' })
          }
        "
        @clicked="
          () => {
            state.renderChargingStations = randomUUID()
          }
        "
      >
        Add Charging Stations
      </ToggleButton>
      <ReloadButton
        id="reload-button"
        :loading="state.loading"
        @click="loadChargingStations(() => (state.renderChargingStations = randomUUID()))"
      />
    </Container>
    <CSTable
      v-show="
        Array.isArray(app?.appContext.config.globalProperties.$chargingStations) &&
        app.appContext.config.globalProperties.$chargingStations.length > 0
      "
      :key="state.renderChargingStations"
      :charging-stations="app?.appContext.config.globalProperties.$chargingStations"
      @need-refresh="
        () => {
          state.renderAddChargingStations = randomUUID()
          state.renderChargingStations = randomUUID()
        }
      "
    />
  </Container>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, ref } from 'vue'
import { useToast } from 'vue-toast-notification'
import CSTable from '@/components/charging-stations/CSTable.vue'
import type { ResponsePayload, SimulatorState, UIServerConfigurationSection } from '@/types'
import Container from '@/components/Container.vue'
import ReloadButton from '@/components/buttons/ReloadButton.vue'
import {
  deleteFromLocalStorage,
  getFromLocalStorage,
  getLocalStorage,
  randomUUID,
  setToLocalStorage
} from '@/composables'
import ToggleButton from '@/components/buttons/ToggleButton.vue'

const state = ref<{
  renderSimulator: `${string}-${string}-${string}-${string}-${string}`
  renderAddChargingStations: `${string}-${string}-${string}-${string}-${string}`
  renderChargingStations: `${string}-${string}-${string}-${string}-${string}`
  loading: boolean
  simulatorState?: SimulatorState
  uiServerIndex: number
}>({
  renderSimulator: randomUUID(),
  renderAddChargingStations: randomUUID(),
  renderChargingStations: randomUUID(),
  loading: false,
  uiServerIndex: getFromLocalStorage<number>('uiServerConfigurationIndex', 0)
})

const app = getCurrentInstance()

const clearToggleButtons = (): void => {
  for (const key in getLocalStorage()) {
    if (key.includes('toggle-button')) {
      deleteFromLocalStorage(key)
    }
  }
}

const clearChargingStations = (): void => {
  app!.appContext.config.globalProperties.$chargingStations = []
  state.value.renderChargingStations = randomUUID()
}

const uiClient = app?.appContext.config.globalProperties.$uiClient

const getSimulatorState = (): void => {
  uiClient
    .simulatorState()
    .then((response: ResponsePayload) => {
      state.value.simulatorState = response.state as SimulatorState
    })
    .catch((error: Error) => {
      $toast.error('Error at fetching simulator state')
      console.error('Error at fetching simulator state:', error)
    })
    .finally(() => {
      state.value.renderSimulator = randomUUID()
    })
}

const initializeWSEventListeners = () => {
  app?.appContext.config.globalProperties.$uiClient.registerWSEventListener('open', () => {
    getSimulatorState()
    uiClient
      .listTemplates()
      .then((response: ResponsePayload) => {
        if (app != null) {
          app.appContext.config.globalProperties.$templates = response.templates
        }
      })
      .catch((error: Error) => {
        if (app != null) {
          app.appContext.config.globalProperties.$templates = []
        }
        $toast.error('Error at fetching charging station templates')
        console.error('Error at fetching charging station templates:', error)
      })
      .finally(() => {
        state.value.renderAddChargingStations = randomUUID()
      })
    loadChargingStations(() => {
      state.value.renderChargingStations = randomUUID()
    })
  })
  app?.appContext.config.globalProperties.$uiClient.registerWSEventListener(
    'error',
    clearChargingStations
  )
  app?.appContext.config.globalProperties.$uiClient.registerWSEventListener(
    'close',
    clearChargingStations
  )
}

onMounted(() => {
  initializeWSEventListeners()
})

const uiServerConfigurations: { index: number; configuration: UIServerConfigurationSection }[] =
  app?.appContext.config.globalProperties.$configuration.uiServer.map(
    (configuration: UIServerConfigurationSection, index: number) => ({
      index,
      configuration
    })
  )

const $toast = useToast()

const loadChargingStations = (renderCallback?: () => void): void => {
  if (state.value.loading === false) {
    state.value.loading = true
    uiClient
      .listChargingStations()
      .then((response: ResponsePayload) => {
        if (app != null) {
          app.appContext.config.globalProperties.$chargingStations = response.chargingStations
        }
      })
      .catch((error: Error) => {
        if (app != null) {
          app.appContext.config.globalProperties.$chargingStations = []
        }
        $toast.error('Error at fetching charging stations')
        console.error('Error at fetching charging stations:', error)
      })
      .finally(() => {
        if (renderCallback != null) {
          renderCallback()
        }
        state.value.loading = false
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
    .finally(() => {
      getSimulatorState()
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
    .finally(() => {
      getSimulatorState()
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
  justify-content: center;
}

#ui-server-selector {
  width: 100%;
  background-color: rgb(239, 239, 239);
  font: small-caption;
  text-align: center;
}

#ui-server-selector:hover {
  background-color: rgb(229, 229, 229);
}

#buttons-container {
  display: flex;
  flex-direction: row;
}

.simulator-start-button {
  color: ivory;
  background-color: green;
}

.simulator-stop-button {
  color: ivory;
  background-color: red;
}

#action-button {
  flex: none;
}

#reload-button {
  color: ivory;
  background-color: blue;
  font-size: 2rem;
}

#reload-button:hover {
  background-color: rgb(0, 0, 225);
}

#reload-button:active {
  background-color: darkblue;
}

#action {
  color: ivory;
  background-color: black;
  padding: 1%;
}
</style>
