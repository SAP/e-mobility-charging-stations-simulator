<template>
  <main
    class="v2-app"
    :data-v2-theme="effectiveTheme"
  >
    <SimulatorBar
      :refresh-pending="refreshing"
      :selected-server-index="state.uiServerIndex"
      :simulator-pending="simulatorPending"
      :simulator-state="simulatorState"
      :theme-mode="themeMode"
      :ui-server-configurations="uiServerConfigurations"
      @add="openAddDialog"
      @cycle-theme="cycleTheme"
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
  </main>
</template>

<script setup lang="ts">
import {
  type ChargingStationData,
  type SimulatorState,
  type UIServerConfigurationSection,
} from 'ui-common'
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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

import '../assets/v2.css'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SimulatorBar from '../components/SimulatorBar.vue'
import StationCard from '../components/StationCard.vue'
import {
  V2_ROUTE_NAMES,
  V2_THEME_KEY,
  V2_UI_SERVER_INDEX_KEY,
  type V2ThemeEffective,
  type V2ThemeMode,
} from '../composables/v2Constants'

const $configuration = useConfiguration()
const $templates = useTemplates()
const $chargingStations = useChargingStations()
const $uiClient = useUIClient()
const $route = useRoute()
const $router = useRouter()
const $toast = useToast()

const simulatorState = ref<SimulatorState | undefined>(undefined)
const simulatorPending = ref(false)
const confirmingStopSim = ref(false)
const refreshing = ref(false)

const state = ref({
  uiServerIndex: getFromLocalStorage<number>(V2_UI_SERVER_INDEX_KEY, 0),
})

/* global MediaQueryList, MediaQueryListEvent */
const themeMode = ref<V2ThemeMode>(getFromLocalStorage<V2ThemeMode>(V2_THEME_KEY, 'auto'))

const prefersDark = ref(
  typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
)

const effectiveTheme = computed<V2ThemeEffective>(() => {
  if (themeMode.value === 'light') return 'light'
  if (themeMode.value === 'dark') return 'dark'
  return prefersDark.value ? 'dark' : 'light'
})

const cycleTheme = (): void => {
  const next: V2ThemeMode =
    themeMode.value === 'dark' ? 'light' : themeMode.value === 'light' ? 'auto' : 'dark'
  themeMode.value = next
  setToLocalStorage<V2ThemeMode>(V2_THEME_KEY, next)
}

let prefersDarkMedia: MediaQueryList | undefined
const onPrefersDarkChange = (event: MediaQueryListEvent): void => {
  prefersDark.value = event.matches
}

// Mirror the effective theme onto <html> so teleported modals
// (rendered into <body>, outside the .v2-app root) also pick it up.
watchEffect(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.v2Theme = effectiveTheme.value
  }
})

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
      if ($route.name !== V2_ROUTE_NAMES.V2_CHARGING_STATIONS) {
        $router.push({ name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS }).catch((error: unknown) => {
          console.error('Navigation failed:', error)
        })
      }
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

const openAddDialog = (): void => {
  $router.push({ name: V2_ROUTE_NAMES.V2_ADD_CHARGING_STATIONS }).catch((error: unknown) => {
    console.error('Navigation failed:', error)
  })
}

let unsubscribeRefresh: (() => void) | undefined

onMounted(() => {
  registerWSEventListeners()
  unsubscribeRefresh = $uiClient.onRefresh(() => {
    getChargingStations()
  })
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    prefersDarkMedia = window.matchMedia('(prefers-color-scheme: dark)')
    prefersDarkMedia.addEventListener('change', onPrefersDarkChange)
  }
})

onUnmounted(() => {
  unregisterWSEventListeners()
  unsubscribeRefresh?.()
  prefersDarkMedia?.removeEventListener('change', onPrefersDarkChange)
  // Clean up the theme attribute so v1 isn't affected when the user
  // navigates away from /v2.
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.v2Theme
  }
})
</script>
