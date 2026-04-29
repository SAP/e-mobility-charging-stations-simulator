<template>
  <div class="classic-layout">
    <Container class="charging-stations-container">
      <Container class="buttons-container">
        <Container
          v-show="uiServerConfigurations.length > 1"
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
        <select
          :value="activeSkinId"
          class="ui-server-selector"
          @change="e => switchSkin((e.target as HTMLSelectElement).value)"
        >
          <option
            v-for="skin in skins"
            :key="skin.id"
            :value="skin.id"
          >
            {{ skin.label }}
          </option>
        </select>
        <select
          :value="activeTheme"
          class="ui-server-selector"
          @change="e => setTheme((e.target as HTMLSelectElement).value as ThemeName)"
        >
          <option
            v-for="theme in availableThemes"
            :key="theme"
            :value="theme"
          >
            {{ theme }}
          </option>
        </select>
      </Container>
      <CSTable
        v-show="$chargingStations.length > 0"
        :charging-stations="$chargingStations"
        @need-refresh="
          () => {
            state.renderAddChargingStations = randomUUID()
          }
        "
      />
    </Container>
    <Container
      v-show="
        $route.name !== ROUTE_NAMES.CHARGING_STATIONS && $route.name !== ROUTE_NAMES.NOT_FOUND
      "
      id="action-container"
      class="action-container"
    >
      <router-view name="action" />
    </Container>
  </div>
</template>

<script setup lang="ts">
import { randomUUID, type UUIDv4 } from 'ui-common'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  deleteLocalStorageByKeyPattern,
  getFromLocalStorage,
  resetToggleButtonState,
  ROUTE_NAMES,
  TOGGLE_BUTTON_KEY_PREFIX,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
} from '@/composables'
import { useLayoutData } from '@/shared/composables/useLayoutData.js'
import { useSimulatorControl } from '@/shared/composables/useSimulatorControl.js'
import { useSkin } from '@/shared/composables/useSkin.js'
import { type ThemeName, useTheme } from '@/shared/composables/useTheme.js'

import StateButton from './components/buttons/StateButton.vue'
import ToggleButton from './components/buttons/ToggleButton.vue'
import CSTable from './components/charging-stations/CSTable.vue'
import Container from './components/Container.vue'

const layoutData = useLayoutData()
const { simulatorStarted, simulatorState, uiServerConfigurations } = layoutData

const simulatorLabel = (action: string): string =>
  `${action} Simulator${
    simulatorState.value?.version != null ? ` (${simulatorState.value.version})` : ''
  }`

const state = ref<{
  renderAddChargingStations: UUIDv4
  uiServerIndex: number
}>({
  renderAddChargingStations: randomUUID(),
  uiServerIndex: getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0),
})

const refresh = (): void => {
  state.value.renderAddChargingStations = randomUUID()
}

const clearToggleButtons = (): void => {
  deleteLocalStorageByKeyPattern(TOGGLE_BUTTON_KEY_PREFIX)
}

const $chargingStations = useChargingStations()
const $route = useRoute()
const $router = useRouter()

const { activeSkinId, skins, switchSkin } = useSkin()
const { activeTheme, availableThemes, setTheme } = useTheme()

const {
  handleUIServerChange: switchServer,
  startSimulator,
  stopSimulator,
} = useSimulatorControl(layoutData, {
  onServerSwitched: () => {
    clearToggleButtons()
    refresh()
    if ($route.name !== ROUTE_NAMES.CHARGING_STATIONS) {
      $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
    }
  },
  onSimulatorStopped: () => {
    resetToggleButtonState('add-charging-stations', true)
  },
})

const handleUIServerChange = (): void => {
  switchServer(state.value.uiServerIndex)
}

watch(
  () => $route.name,
  name => {
    if (name === ROUTE_NAMES.CHARGING_STATIONS) {
      refresh()
    }
  }
)
</script>

<style scoped>
.classic-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
}

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

.action-container {
  flex: none;
  min-width: max-content;
  height: fit-content;
  display: flex;
  position: sticky;
  top: 0;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  margin-inline: var(--spacing-sm);
  padding: var(--spacing-md);
  border: solid 0.25px var(--color-border);
}
</style>
