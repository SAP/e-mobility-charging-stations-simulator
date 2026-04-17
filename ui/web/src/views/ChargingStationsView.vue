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
          @change="handleUIServerChange"
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
import {
  type ChargingStationData,
  randomUUID,
  type SimulatorState,
  type UIServerConfigurationSection,
  type UUIDv4,
} from 'ui-common'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import StateButton from '@/components/buttons/StateButton.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import CSTable from '@/components/charging-stations/CSTable.vue'
import Container from '@/components/Container.vue'
import {
  deleteLocalStorageByKeyPattern,
  getFromLocalStorage,
  ROUTE_NAMES,
  setToLocalStorage,
  TOGGLE_BUTTON_KEY_PREFIX,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
  useConfiguration,
  useExecuteAction,
  useFetchData,
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
  renderAddChargingStations: UUIDv4
  renderChargingStations: UUIDv4
  uiServerIndex: number
}>({
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
const $route = useRoute()
const $router = useRouter()

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

const executeAction = useExecuteAction()

const { fetch: getSimulatorState } = useFetchData(
  () => $uiClient.simulatorState(),
  response => {
    simulatorState.value = response.state as unknown as SimulatorState
  },
  'Error at fetching simulator state'
)

const { fetch: getTemplates } = useFetchData(
  () => $uiClient.listTemplates(),
  response => {
    $templates.value = response.templates as string[]
  },
  'Error at fetching charging station templates',
  clearTemplates
)

const { fetch: getChargingStations } = useFetchData(
  () => $uiClient.listChargingStations(),
  response => {
    $chargingStations.value = response.chargingStations as ChargingStationData[]
  },
  'Error at fetching charging stations',
  clearChargingStations
)

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

const handleUIServerChange = (): void => {
  const currentIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
  if (currentIndex === state.value.uiServerIndex) return

  $uiClient.setConfiguration(
    ($configuration.value.uiServer as UIServerConfigurationSection[])[state.value.uiServerIndex]
  )
  registerWSEventListeners()

  $uiClient.registerWSEventListener(
    'open',
    () => {
      setToLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, state.value.uiServerIndex)
      clearToggleButtons()
      refresh()
      if ($route.name !== ROUTE_NAMES.CHARGING_STATIONS) {
        $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
      }
    },
    { once: true }
  )

  $uiClient.registerWSEventListener(
    'error',
    () => {
      state.value.uiServerIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
      $uiClient.setConfiguration(
        ($configuration.value.uiServer as UIServerConfigurationSection[])[state.value.uiServerIndex]
      )
      registerWSEventListeners()
    },
    { once: true }
  )
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
  executeAction(
    $uiClient.startSimulator(),
    'Simulator successfully started',
    'Error at starting simulator',
    { onFinally: getSimulatorState }
  )
}
const stopSimulator = (): void => {
  executeAction(
    $uiClient.stopSimulator(),
    'Simulator successfully stopped',
    'Error at stopping simulator',
    { onFinally: getSimulatorState, onSuccess: clearChargingStations }
  )
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
