<template>
  <main class="modern-app">
    <SimulatorBar
      :selected-server-index="uiServerIndex"
      :server-switch-pending="serverSwitchPending"
      :simulator-pending="simulatorPending"
      :simulator-state="simulatorState"
      :ui-server-configurations="uiServerConfigurations"
      @add="showAddDialog = true"
      @switch-server="handleUIServerChange"
      @toggle-simulator="toggleSimulator"
    />
    <div
      v-if="$chargingStations.length === 0"
      class="modern-empty"
    >
      <div class="modern-empty__title">
        No charging stations
      </div>
      <p>
        Click <strong>Add Stations</strong> in the bar above to spin up your first one from a
        template.
      </p>
    </div>
    <section
      v-else
      class="modern-grid"
      aria-label="Charging stations"
    >
      <StationCard
        v-for="station in $chargingStations"
        :key="station.stationInfo.hashId"
        :charging-station="station"
        @need-refresh="getChargingStations"
        @open-authorize="openAuthorizeDialog"
        @open-set-url="openSetUrlDialog"
        @open-start-tx="openStartTxDialog"
      />
    </section>
    <ConfirmDialog
      v-if="confirmingStopSim"
      title="Stop the simulator?"
      message="All running charging stations and active transactions will stop."
      confirm-label="Stop"
      :pending="simulatorPending"
      @cancel="confirmingStopSim = false"
      @confirm="confirmStopSimulator"
    />
    <AddStationsDialog
      v-if="showAddDialog"
      @close="showAddDialog = false"
    />
    <SetSupervisionUrlDialog
      v-if="showSetUrlDialog"
      :hash-id="showSetUrlDialog.hashId"
      :charging-station-id="showSetUrlDialog.chargingStationId"
      @close="showSetUrlDialog = null"
    />
    <StartTransactionDialog
      v-if="showStartTxDialog"
      :hash-id="showStartTxDialog.hashId"
      :charging-station-id="showStartTxDialog.chargingStationId"
      :connector-id="showStartTxDialog.connectorId"
      :evse-id="showStartTxDialog.evseId"
      :ocpp-version="showStartTxDialog.ocppVersion"
      @close="showStartTxDialog = null"
    />
    <AuthorizeDialog
      v-if="showAuthorizeDialog"
      :hash-id="showAuthorizeDialog.hashId"
      :charging-station-id="showAuthorizeDialog.chargingStationId"
      :ocpp-version="showAuthorizeDialog.ocppVersion"
      @close="showAuthorizeDialog = null"
    />
  </main>
</template>

<script setup lang="ts">
// Dialog state via v-if (no URL coupling), enabling skin-independent modal interactions.
import { type OCPPVersion } from 'ui-common'
import { defineAsyncComponent, ref } from 'vue'

import {
  ASYNC_COMPONENT_DELAY_MS,
  ASYNC_COMPONENT_TIMEOUT_MS,
  getFromLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
} from '@/core/index.js'
import SkinLoadError from '@/shared/components/SkinLoadError.vue'
import SkinLoading from '@/shared/components/SkinLoading.vue'
import { useLayoutData } from '@/shared/composables/useLayoutData.js'
import { useSimulatorControl } from '@/shared/composables/useSimulatorControl.js'

import ConfirmDialog from './components/ConfirmDialog.vue'
import SimulatorBar from './components/SimulatorBar.vue'
import StationCard from './components/StationCard.vue'

/**
 * Creates a lazy-loaded dialog component with shared loading/error boundaries.
 * @param loader - Dynamic import function for the dialog component
 * @returns An async component definition with standardized loading and error states
 */
function defineAsyncDialog (loader: () => Promise<{ default: unknown }>) {
  return defineAsyncComponent({
    delay: ASYNC_COMPONENT_DELAY_MS,
    errorComponent: SkinLoadError,
    loader: loader as () => Promise<{ default: import('vue').Component }>,
    loadingComponent: SkinLoading,
    timeout: ASYNC_COMPONENT_TIMEOUT_MS,
  })
}

const AddStationsDialog = defineAsyncDialog(
  () => import('./components/dialogs/AddStationsDialog.vue')
)
const AuthorizeDialog = defineAsyncDialog(() => import('./components/dialogs/AuthorizeDialog.vue'))
const SetSupervisionUrlDialog = defineAsyncDialog(
  () => import('./components/dialogs/SetSupervisionUrlDialog.vue')
)
const StartTransactionDialog = defineAsyncDialog(
  () => import('./components/dialogs/StartTransactionDialog.vue')
)

const $chargingStations = useChargingStations()

const layoutData = useLayoutData()
const { getChargingStations, simulatorState, uiServerConfigurations } = layoutData

const uiServerIndex = ref(getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0))

const {
  handleUIServerChange: switchServer,
  serverSwitchPending,
  simulatorPending,
  startSimulator,
  stopSimulator,
} = useSimulatorControl(layoutData)

const handleUIServerChange = (nextIndex: number): void => {
  uiServerIndex.value = nextIndex
  switchServer(nextIndex)
}

const confirmingStopSim = ref(false)

const showAddDialog = ref(false)
const showSetUrlDialog = ref<null | {
  chargingStationId: string
  hashId: string
}>(null)
const showStartTxDialog = ref<null | {
  chargingStationId: string
  connectorId: string
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>(null)
const showAuthorizeDialog = ref<null | {
  chargingStationId: string
  hashId: string
  ocppVersion?: OCPPVersion
}>(null)

const confirmStopSimulator = (): void => {
  stopSimulator()
  confirmingStopSim.value = false
}

const toggleSimulator = (): void => {
  if (simulatorState.value?.started === true) {
    confirmingStopSim.value = true
  } else {
    startSimulator()
  }
}

const openAuthorizeDialog = (data: typeof showAuthorizeDialog.value): void => {
  showAuthorizeDialog.value = data
}
const openSetUrlDialog = (data: typeof showSetUrlDialog.value): void => {
  showSetUrlDialog.value = data
}
const openStartTxDialog = (data: typeof showStartTxDialog.value): void => {
  showStartTxDialog.value = data
}
</script>
