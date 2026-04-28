<template>
  <main class="modern-app">
    <SimulatorBar
      :refresh-pending="refreshing"
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
import {
  type OCPPVersion,
  type UIServerConfigurationSection,
} from 'ui-common'
import { computed, ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import {
  getFromLocalStorage,
  setToLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useChargingStations,
  useConfiguration,
  useUIClient,
} from '@/composables'
import { useLayoutData } from '@/shared/composables/useLayoutData.js'

import './modern.css'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AddStationsDialog from './components/dialogs/AddStationsDialog.vue'
import AuthorizeDialog from './components/dialogs/AuthorizeDialog.vue'
import SetSupervisionUrlDialog from './components/dialogs/SetSupervisionUrlDialog.vue'
import StartTransactionDialog from './components/dialogs/StartTransactionDialog.vue'
import SimulatorBar from './components/SimulatorBar.vue'
import StationCard from './components/StationCard.vue'

const $configuration = useConfiguration()
const $chargingStations = useChargingStations()
const $uiClient = useUIClient()
const $toast = useToast()

const {
  getData,
  getChargingStations,
  getSimulatorState,
  registerWSEventListeners,
  simulatorState,
} = useLayoutData()

const simulatorPending = ref(false)
const confirmingStopSim = ref(false)
const refreshing = ref(false)

const state = ref({
  uiServerIndex: getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0),
})

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

const uiServerConfigurations = computed(() =>
  ($configuration.value.uiServer as UIServerConfigurationSection[]).map((configuration, index) => ({
    configuration,
    index,
  }))
)

const refreshData = (): void => {
  refreshing.value = true
  getData()
  setTimeout(() => {
    refreshing.value = false
  }, 600)
}

const handleUIServerChange = (nextIndex: number): void => {
  if (nextIndex === state.value.uiServerIndex) return
  state.value.uiServerIndex = nextIndex
  $uiClient.setConfiguration(
    ($configuration.value.uiServer as UIServerConfigurationSection[])[nextIndex]
  )
  registerWSEventListeners()
  $uiClient.registerWSEventListener(
    'open',
    () => {
      setToLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, nextIndex)
    },
    { once: true }
  )
}

const startSimulator = async (): Promise<void> => {
  if (simulatorPending.value) return
  simulatorPending.value = true
  try {
    await $uiClient.startSimulator()
    $toast.success('Simulator started')
  } catch (error) {
    console.error('Error starting simulator:', error)
    $toast.error('Error starting simulator')
  } finally {
    simulatorPending.value = false
    getSimulatorState()
  }
}

const stopSimulator = async (): Promise<void> => {
  if (simulatorPending.value) return
  simulatorPending.value = true
  try {
    await $uiClient.stopSimulator()
    $chargingStations.value = []
    confirmingStopSim.value = false
    $toast.success('Simulator stopped')
  } catch (error) {
    console.error('Error stopping simulator:', error)
    $toast.error('Error stopping simulator')
  } finally {
    simulatorPending.value = false
    getSimulatorState()
  }
}

const confirmStopSimulator = (): void => {
  stopSimulator().catch((error: unknown) => {
    console.error('stopSimulator failed:', error)
  })
}

const toggleSimulator = (): void => {
  if (simulatorState.value?.started === true) {
    confirmingStopSim.value = true
  } else {
    startSimulator().catch((error: unknown) => {
      console.error('startSimulator failed:', error)
    })
  }
}
</script>
