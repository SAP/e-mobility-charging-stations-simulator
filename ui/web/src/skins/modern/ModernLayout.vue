<template>
  <main class="modern-app">
    <SimulatorBar
      :refresh-pending="loading"
      :selected-server-index="state.uiServerIndex"
      :simulator-pending="simulatorPending"
      :simulator-state="simulatorState"
      :ui-server-configurations="uiServerConfigurations"
      @add="showAddDialog = true"
      @refresh="refreshData"
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
        @open-authorize="data => (showAuthorizeDialog = data)"
        @open-set-url="data => (showSetUrlDialog = data)"
        @open-start-tx="data => (showStartTxDialog = data)"
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
      @close="showAuthorizeDialog = null"
    />
  </main>
</template>

<script setup lang="ts">
// Modern skin uses component-level dialog state (v-if) instead of router navigation.
// This avoids URL coupling for modal interactions and enables independent skin operation.
import { type OCPPVersion } from 'ui-common'
import { ref } from 'vue'

import {
  getFromLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
} from '@/composables'
import { useLayoutData } from '@/shared/composables/useLayoutData.js'
import { useSimulatorControl } from '@/shared/composables/useSimulatorControl.js'

import './modern.css'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AddStationsDialog from './components/dialogs/AddStationsDialog.vue'
import AuthorizeDialog from './components/dialogs/AuthorizeDialog.vue'
import SetSupervisionUrlDialog from './components/dialogs/SetSupervisionUrlDialog.vue'
import StartTransactionDialog from './components/dialogs/StartTransactionDialog.vue'
import SimulatorBar from './components/SimulatorBar.vue'
import StationCard from './components/StationCard.vue'

const $chargingStations = useChargingStations()

const layoutData = useLayoutData()
const {
  getChargingStations,
  getData,
  loading,
  simulatorState,
  uiServerConfigurations,
} = layoutData

const state = ref({
  uiServerIndex: getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0),
})

const {
  handleUIServerChange: switchServer,
  simulatorPending,
  startSimulator,
  stopSimulator,
} = useSimulatorControl(layoutData)

const handleUIServerChange = (nextIndex: number): void => {
  state.value.uiServerIndex = nextIndex
  switchServer(nextIndex)
}

const confirmingStopSim = ref(false)

// Dialog state
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
}>(null)

const refreshData = (): void => {
  getData()
}

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
</script>
