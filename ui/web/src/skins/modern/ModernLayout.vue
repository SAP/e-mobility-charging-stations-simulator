<template>
  <main class="v2-app">
    <SimulatorBar
      :refresh-pending="refreshing"
      :selected-server-index="state.uiServerIndex"
      :simulator-pending="simulatorPending"
      :simulator-state="simulatorState"
      :ui-server-configurations="uiServerConfigurations"
      @add="showAddDialog = true"
      @refresh="getData"
      @switch-server="handleUIServerChange"
      @toggle-simulator="toggleSimulator"
    />
    <div
      v-if="$chargingStations.length === 0"
      class="v2-empty"
    >
      <div class="v2-empty__title">
        No charging stations
      </div>
      <p>
        Click <strong>Add Stations</strong> in the bar above to spin up your first one from a
        template.
      </p>
    </div>
    <section
      v-else
      class="v2-grid"
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
import {
  type ChargingStationData,
  type OCPPVersion,
  type SimulatorState,
  type UIServerConfigurationSection,
} from 'ui-common'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import {
  getFromLocalStorage,
  setToLocalStorage,
  useChargingStations,
  useConfiguration,
  useFetchData,
  useTemplates,
  useUIClient,
} from '@/composables'

import './modern.css'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AddStationsDialog from './components/dialogs/AddStationsDialog.vue'
import AuthorizeDialog from './components/dialogs/AuthorizeDialog.vue'
import SetSupervisionUrlDialog from './components/dialogs/SetSupervisionUrlDialog.vue'
import StartTransactionDialog from './components/dialogs/StartTransactionDialog.vue'
import SimulatorBar from './components/SimulatorBar.vue'
import StationCard from './components/StationCard.vue'
import { V2_UI_SERVER_INDEX_KEY } from './composables/constants'

const $configuration = useConfiguration()
const $templates = useTemplates()
const $chargingStations = useChargingStations()
const $uiClient = useUIClient()
const $toast = useToast()

const simulatorState = ref<SimulatorState | undefined>(undefined)
const simulatorPending = ref(false)
const confirmingStopSim = ref(false)
const refreshing = ref(false)

const state = ref({
  uiServerIndex: getFromLocalStorage<number>(V2_UI_SERVER_INDEX_KEY, 0),
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

const clearChargingStations = (): void => {
  $chargingStations.value = []
}

const clearTemplates = (): void => {
  $templates.value = []
}

const { fetch: getSimulatorState } = useFetchData(
  () => $uiClient.simulatorState(),
  response => {
    simulatorState.value = response.state as unknown as SimulatorState
  },
  'Error fetching simulator state'
)

const { fetch: getTemplates } = useFetchData(
  () => $uiClient.listTemplates(),
  response => {
    $templates.value = response.templates as string[]
  },
  'Error fetching templates',
  clearTemplates
)

const { fetch: getChargingStations } = useFetchData(
  () => $uiClient.listChargingStations(),
  response => {
    $chargingStations.value = response.chargingStations as ChargingStationData[]
  },
  'Error fetching charging stations',
  clearChargingStations
)

const getData = (): void => {
  refreshing.value = true
  getSimulatorState()
  getTemplates()
  getChargingStations()
  // Crude debounce: drop the spinner shortly after the calls fire — each
  // useFetchData flips its own internal `fetching` ref, but the bar only
  // needs a brief signal that something happened.
  setTimeout(() => {
    refreshing.value = false
  }, 600)
}

const registerWSEventListeners = (): void => {
  $uiClient.registerWSEventListener('open', getData)
  $uiClient.registerWSEventListener('error', clearChargingStations)
  $uiClient.registerWSEventListener('close', clearChargingStations)
}

const unregisterWSEventListeners = (): void => {
  $uiClient.unregisterWSEventListener('open', getData)
  $uiClient.unregisterWSEventListener('error', clearChargingStations)
  $uiClient.unregisterWSEventListener('close', clearChargingStations)
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
      setToLocalStorage<number>(V2_UI_SERVER_INDEX_KEY, nextIndex)
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
    clearChargingStations()
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
</script>
