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
                $uiClient.setConfiguration(
                  ($configuration.value.uiServer as UIServerConfigurationSection[])[
                    state.uiServerIndex
                  ]
                )
                registerWSEventListeners()
                $uiClient.registerWSEventListener(
                  'open',
                  () => {
                    setToLocalStorage<number>('uiServerConfigurationIndex', state.uiServerIndex)
                    clearToggleButtons()
                    $route.name !== 'charging-stations' &&
                      $router.push({ name: 'charging-stations' })
                  },
                  { once: true }
                )
                $uiClient.registerWSEventListener(
                  'error',
                  () => {
                    state.uiServerIndex = getFromLocalStorage<number>(
                      'uiServerConfigurationIndex',
                      0
                    )
                    $uiClient.setConfiguration(
                      ($configuration.value.uiServer as UIServerConfigurationSection[])[
                        getFromLocalStorage<number>('uiServerConfigurationIndex', 0)
                      ]
                    )
                    registerWSEventListeners()
                  },
                  { once: true }
                )
              }
            }
          "
        >
          <option
            v-for="uiServerConfiguration in uiServerConfigurations"
            :key="uiServerConfiguration.index"
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
        :status="simulatorState?.started"
        :on="() => startSimulator()"
        :off="() => stopSimulator()"
        :class="simulatorButtonClass"
      >
        {{ simulatorButtonMessage }}
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
        :loading="state.gettingChargingStations"
        @click="getChargingStations()"
      />
    </Container>
    <CSTable
      v-show="Array.isArray($chargingStations.value) && $chargingStations.value.length > 0"
      :key="state.renderChargingStations"
      :charging-stations="$chargingStations.value"
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
import { computed, getCurrentInstance, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from 'vue-toast-notification'

import ReloadButton from '@/components/buttons/ReloadButton.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import CSTable from '@/components/charging-stations/CSTable.vue'
import Container from '@/components/Container.vue'
import {
  deleteFromLocalStorage,
  getFromLocalStorage,
  getLocalStorage,
  randomUUID,
  setToLocalStorage,
  useUIClient,
} from '@/composables'
import type {
  ChargingStationData,
  ResponsePayload,
  SimulatorState,
  UIServerConfigurationSection,
} from '@/types'

const simulatorState = ref<SimulatorState | undefined>(undefined)

const simulatorButtonClass = computed<string>(() =>
  simulatorState.value?.started === true ? 'simulator-stop-button' : 'simulator-start-button'
)
const simulatorButtonMessage = computed<string>(
  () =>
    `${simulatorState.value?.started === true ? 'Stop' : 'Start'} Simulator${
      simulatorState.value?.version != null ? ` (${simulatorState.value.version})` : ''
    }`
)

const state = ref<{
  renderSimulator: `${string}-${string}-${string}-${string}-${string}`
  renderAddChargingStations: `${string}-${string}-${string}-${string}-${string}`
  renderChargingStations: `${string}-${string}-${string}-${string}-${string}`
  gettingSimulatorState: boolean
  gettingTemplates: boolean
  gettingChargingStations: boolean
  uiServerIndex: number
}>({
  renderSimulator: randomUUID(),
  renderAddChargingStations: randomUUID(),
  renderChargingStations: randomUUID(),
  gettingSimulatorState: false,
  gettingTemplates: false,
  gettingChargingStations: false,
  uiServerIndex: getFromLocalStorage<number>('uiServerConfigurationIndex', 0),
})

const clearToggleButtons = (): void => {
  for (const key in getLocalStorage()) {
    if (key.includes('toggle-button')) {
      deleteFromLocalStorage(key)
    }
  }
  state.value.renderChargingStations = randomUUID()
  state.value.renderAddChargingStations = randomUUID()
}

const app = getCurrentInstance()

watch(app!.appContext.config.globalProperties.$chargingStations, () => {
  state.value.renderChargingStations = randomUUID()
})

watch(simulatorState, () => {
  state.value.renderSimulator = randomUUID()
})

const clearTemplates = (): void => {
  if (app != null) {
    app.appContext.config.globalProperties.$templates.value = []
  }
}

const clearChargingStations = (): void => {
  if (app != null) {
    app.appContext.config.globalProperties.$chargingStations.value = []
  }
}

const uiClient = useUIClient()

const $toast = useToast()

const getSimulatorState = (): void => {
  if (state.value.gettingSimulatorState === false) {
    state.value.gettingSimulatorState = true
    uiClient
      .simulatorState()
      .then((response: ResponsePayload) => {
        simulatorState.value = response.state as SimulatorState
      })
      .catch((error: Error) => {
        $toast.error('Error at fetching simulator state')
        console.error('Error at fetching simulator state:', error)
      })
      .finally(() => {
        state.value.gettingSimulatorState = false
      })
  }
}

const getTemplates = (): void => {
  if (state.value.gettingTemplates === false) {
    state.value.gettingTemplates = true
    uiClient
      .listTemplates()
      .then((response: ResponsePayload) => {
        if (app != null) {
          app.appContext.config.globalProperties.$templates.value = response.templates as string[]
        }
      })
      .catch((error: Error) => {
        clearTemplates()
        $toast.error('Error at fetching charging station templates')
        console.error('Error at fetching charging station templates:', error)
      })
      .finally(() => {
        state.value.gettingTemplates = false
      })
  }
}

const getChargingStations = (): void => {
  if (state.value.gettingChargingStations === false) {
    state.value.gettingChargingStations = true
    uiClient
      .listChargingStations()
      .then((response: ResponsePayload) => {
        if (app != null) {
          app.appContext.config.globalProperties.$chargingStations.value =
            response.chargingStations as ChargingStationData[]
        }
      })
      .catch((error: Error) => {
        clearChargingStations()
        $toast.error('Error at fetching charging stations')
        console.error('Error at fetching charging stations:', error)
      })
      .finally(() => {
        state.value.gettingChargingStations = false
      })
  }
}

const getData = (): void => {
  getSimulatorState()
  getTemplates()
  getChargingStations()
}

const registerWSEventListeners = () => {
  uiClient.registerWSEventListener('open', getData)
  uiClient.registerWSEventListener('error', clearChargingStations)
  uiClient.registerWSEventListener('close', clearChargingStations)
}

const unregisterWSEventListeners = () => {
  uiClient.unregisterWSEventListener('open', getData)
  uiClient.unregisterWSEventListener('error', clearChargingStations)
  uiClient.unregisterWSEventListener('close', clearChargingStations)
}

onMounted(() => {
  registerWSEventListeners()
})

onUnmounted(() => {
  unregisterWSEventListeners()
})

const uiServerConfigurations: {
  index: number
  configuration: UIServerConfigurationSection
}[] = (
  app?.appContext.config.globalProperties.$configuration.value
    .uiServer as UIServerConfigurationSection[]
).map((configuration: UIServerConfigurationSection, index: number) => ({
  index,
  configuration,
}))

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
      clearChargingStations()
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
  border-style: outset;
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
  position: sticky;
  top: 0;
}

.simulator-start-button {
  color: ivory;
  background-color: green;
}

.simulator-start-button:hover {
  background-color: rgb(0, 98, 0);
}

.simulator-stop-button {
  color: ivory;
  background-color: red;
}

.simulator-stop-button:hover {
  background-color: rgb(225, 0, 0);
}

#action-button {
  flex: none;
}

#reload-button {
  color: ivory;
  background-color: blue;
  font-size: 1.5rem;
}

#reload-button:hover {
  background-color: rgb(0, 0, 225);
}

#reload-button:active {
  background-color: darkblue;
}

#action {
  min-width: max-content;
  color: ivory;
  background-color: black;
  padding: 0.8%;
}
</style>
