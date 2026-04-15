<template>
  <Container class="charging-stations-container">
    <Container class="buttons-container">
      <Container
        v-show="Array.isArray(uiServerConfigurations) && uiServerConfigurations.length > 1"
        id="ui-server-container"
        class="ui-server-container"
      >
        <select
          id="ui-server-selector"
          v-model="state.uiServerIndex"
          class="ui-server-selector"
          @change="
            () => {
              if (
                getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0) !==
                state.uiServerIndex
              ) {
                $uiClient.setConfiguration(
                  ($configuration.uiServer as UIServerConfigurationSection[])[state.uiServerIndex]
                )
                registerWSEventListeners()
                $uiClient.registerWSEventListener(
                  'open',
                  () => {
                    setToLocalStorage<number>(
                      UI_SERVER_CONFIGURATION_INDEX_KEY,
                      state.uiServerIndex
                    )
                    clearToggleButtons()
                    refresh()
                    $route.name !== ROUTE_NAMES.CHARGING_STATIONS &&
                      $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
                  },
                  { once: true }
                )
                $uiClient.registerWSEventListener(
                  'error',
                  () => {
                    state.uiServerIndex = getFromLocalStorage<number>(
                      UI_SERVER_CONFIGURATION_INDEX_KEY,
                      0
                    )
                    $uiClient.setConfiguration(
                      ($configuration.uiServer as UIServerConfigurationSection[])[
                        getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
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
      <StateButton
        :active="simulatorStarted === true"
        :off="() => stopSimulator()"
        :off-label="simulatorLabel('Stop')"
        :on="() => startSimulator()"
        :on-label="simulatorLabel('Start')"
      />
      <ToggleButton
        :id="'add-charging-stations'"
        :key="state.renderAddChargingStations"
        :off="
          () => {
            $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
          }
        "
        :on="
          () => {
            $router.push({ name: ROUTE_NAMES.ADD_CHARGING_STATIONS })
          }
        "
        :shared="true"
      >
        Add Charging Stations
      </ToggleButton>
    </Container>
    <CSTable
      v-show="Array.isArray($chargingStations) && $chargingStations.length > 0"
      :key="state.renderChargingStations"
      :charging-stations="$chargingStations"
      @need-refresh="
        () => {
          state.renderAddChargingStations = randomUUID()
        }
      "
    />
  </Container>
</template>

<script setup lang="ts">
import type { ResponsePayload, UUIDv4 } from 'ui-common'

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from 'vue-toast-notification'

import type { ChargingStationData } from '@/types/ChargingStationType'
import type { UIServerConfigurationSection } from '@/types/ConfigurationType'
import type { SimulatorState } from '@/types/UIProtocol'

import StateButton from '@/components/buttons/StateButton.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import CSTable from '@/components/charging-stations/CSTable.vue'
import Container from '@/components/Container.vue'
import {
  deleteLocalStorageByKeyPattern,
  getFromLocalStorage,
  randomUUID,
  ROUTE_NAMES,
  setToLocalStorage,
  TOGGLE_BUTTON_KEY_PREFIX,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
  useConfiguration,
  useTemplates,
  useUIClient,
} from '@/composables'

const simulatorState = ref<SimulatorState | undefined>(undefined)

const simulatorStarted = computed((): boolean | undefined => simulatorState.value?.started)

const simulatorLabel = (action: string): string =>
  `${action} Simulator${
    simulatorState.value?.version != null ? ` (${simulatorState.value.version})` : ''
  }`

const state = ref<{
  gettingChargingStations: boolean
  gettingSimulatorState: boolean
  gettingTemplates: boolean
  renderAddChargingStations: UUIDv4
  renderChargingStations: UUIDv4
  uiServerIndex: number
}>({
  gettingChargingStations: false,
  gettingSimulatorState: false,
  gettingTemplates: false,
  renderAddChargingStations: randomUUID(),
  renderChargingStations: randomUUID(),
  uiServerIndex: getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0),
})

const refresh = (): void => {
  state.value.renderChargingStations = randomUUID()
  state.value.renderAddChargingStations = randomUUID()
}

const clearToggleButtons = (): void => {
  deleteLocalStorageByKeyPattern(TOGGLE_BUTTON_KEY_PREFIX)
}

const $configuration = useConfiguration()
const $templates = useTemplates()
const $chargingStations = useChargingStations()

watch($chargingStations, () => {
  state.value.renderChargingStations = randomUUID()
})

const clearTemplates = (): void => {
  $templates.value = []
}

const clearChargingStations = (): void => {
  $chargingStations.value = []
}

const $uiClient = useUIClient()

const $toast = useToast()

const getSimulatorState = (): void => {
  if (state.value.gettingSimulatorState === false) {
    state.value.gettingSimulatorState = true
    $uiClient
      .simulatorState()
      .then((response: ResponsePayload) => {
        simulatorState.value = response.state as unknown as SimulatorState
        return undefined
      })
      .finally(() => {
        state.value.gettingSimulatorState = false
      })
      .catch((error: Error) => {
        $toast.error('Error at fetching simulator state')
        console.error('Error at fetching simulator state:', error)
      })
  }
}

const getTemplates = (): void => {
  if (state.value.gettingTemplates === false) {
    state.value.gettingTemplates = true
    $uiClient
      .listTemplates()
      .then((response: ResponsePayload) => {
        $templates.value = response.templates as string[]
        return undefined
      })
      .finally(() => {
        state.value.gettingTemplates = false
      })
      .catch((error: Error) => {
        clearTemplates()
        $toast.error('Error at fetching charging station templates')
        console.error('Error at fetching charging station templates:', error)
      })
  }
}

const getChargingStations = (): void => {
  if (state.value.gettingChargingStations === false) {
    state.value.gettingChargingStations = true
    $uiClient
      .listChargingStations()
      .then((response: ResponsePayload) => {
        $chargingStations.value = response.chargingStations as ChargingStationData[]
        return undefined
      })
      .finally(() => {
        state.value.gettingChargingStations = false
      })
      .catch((error: Error) => {
        clearChargingStations()
        $toast.error('Error at fetching charging stations')
        console.error('Error at fetching charging stations:', error)
      })
  }
}

const getData = (): void => {
  getSimulatorState()
  getTemplates()
  getChargingStations()
}

const registerWSEventListeners = () => {
  $uiClient.registerWSEventListener('open', getData)
  $uiClient.registerWSEventListener('error', clearChargingStations)
  $uiClient.registerWSEventListener('close', clearChargingStations)
}

const unregisterWSEventListeners = () => {
  $uiClient.unregisterWSEventListener('open', getData)
  $uiClient.unregisterWSEventListener('error', clearChargingStations)
  $uiClient.unregisterWSEventListener('close', clearChargingStations)
}

let unsubscribeRefresh: (() => void) | undefined

onMounted(() => {
  registerWSEventListeners()
  unsubscribeRefresh = $uiClient.onRefresh(() => {
    getChargingStations()
  })
})

onUnmounted(() => {
  unregisterWSEventListeners()
  unsubscribeRefresh?.()
})

const uiServerConfigurations: {
  configuration: UIServerConfigurationSection
  index: number
}[] = ($configuration.value.uiServer as UIServerConfigurationSection[]).map(
  (configuration: UIServerConfigurationSection, index: number) => ({
    configuration,
    index,
  })
)

const startSimulator = (): void => {
  $uiClient
    .startSimulator()
    .then(() => {
      return $toast.success('Simulator successfully started')
    })
    .finally(() => {
      getSimulatorState()
    })
    .catch((error: Error) => {
      $toast.error('Error at starting simulator')
      console.error('Error at starting simulator:', error)
    })
}
const stopSimulator = (): void => {
  $uiClient
    .stopSimulator()
    .then(() => {
      clearChargingStations()
      return $toast.success('Simulator successfully stopped')
    })
    .finally(() => {
      getSimulatorState()
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping simulator')
      console.error('Error at stopping simulator:', error)
    })
}
</script>

<style scoped>
.charging-stations-container {
  min-width: 0;
  overflow: hidden;
  height: fit-content;
  display: flex;
  flex-direction: column;
}

.ui-server-container {
  display: flex;
  flex: 3 1 0;
  min-width: 0;
  justify-content: center;
  border: 1px solid var(--color-border-row);
}

.ui-server-selector {
  width: 100%;
  background-color: var(--color-bg-input);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-align: center;
}

.ui-server-selector:hover {
  background-color: var(--color-bg-hover);
}

.ui-server-selector:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.buttons-container {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-xs);
  position: sticky;
  top: 0;
}

.buttons-container > * {
  flex: 1 1 0;
}
</style>
