<template>
  <div class="v2-bar">
    <div class="v2-bar__brand">
      <span
        class="v2-bar__logo"
        aria-hidden="true"
      >EM</span>
      <h1 class="v2-bar__title">
        Charging Simulator
      </h1>
      <span class="v2-bar__title-sub">v2</span>
    </div>
    <div class="v2-bar__group">
      <StatePill :variant="simulatorVariant">
        {{ simulatorLabel }}
      </StatePill>
    </div>
    <span class="v2-bar__sep" />
    <div
      v-if="uiServerConfigurations.length > 1"
      class="v2-bar__group"
    >
      <select
        v-model.number="selectedIndex"
        class="v2-bar__select"
        aria-label="UI server"
        @change="$emit('switch-server', selectedIndex)"
      >
        <option
          v-for="entry in uiServerConfigurations"
          :key="entry.index"
          :value="entry.index"
        >
          {{ entry.configuration.name ?? entry.configuration.host }}
        </option>
      </select>
    </div>
    <div class="v2-bar__group">
      <ActionButton
        variant="ghost"
        :pending="refreshPending"
        title="Refresh charging stations"
        @click="$emit('refresh')"
      >
        Refresh
      </ActionButton>
      <ActionButton
        variant="primary"
        @click="$emit('add')"
      >
        + Add Stations
      </ActionButton>
    </div>
    <div class="v2-bar__group">
      <ActionButton
        :variant="simulatorStarted ? 'danger' : 'primary'"
        :pending="simulatorPending"
        @click="$emit('toggle-simulator')"
      >
        {{ simulatorStarted ? 'Stop' : 'Start' }} Simulator
      </ActionButton>
      <button
        type="button"
        class="v2-icon-btn"
        :title="`Theme: ${themeMode} (click to cycle)`"
        :aria-label="`Theme: ${themeMode} — click to cycle`"
        @click="$emit('cycle-theme')"
      >
        <svg
          v-if="themeMode === 'dark'"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <svg
          v-else-if="themeMode === 'light'"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle
            cx="12"
            cy="12"
            r="4"
          />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
          />
          <path
            d="M12 3a9 9 0 0 1 0 18z"
            fill="currentColor"
          />
        </svg>
      </button>
      <RouterLink
        class="v2-bar__version-link"
        :to="{ name: V1_ROUTE_NAME }"
      >
        v1 →
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SimulatorState, UIServerConfigurationSection } from 'ui-common'

import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { ROUTE_NAMES } from '@/composables'

import type { V2ThemeMode } from '../composables/v2Constants'

import ActionButton from './ActionButton.vue'
import StatePill from './StatePill.vue'

const V1_ROUTE_NAME = ROUTE_NAMES.CHARGING_STATIONS

const props = defineProps<{
  refreshPending?: boolean
  selectedServerIndex: number
  simulatorPending?: boolean
  simulatorState?: SimulatorState
  themeMode: V2ThemeMode
  uiServerConfigurations: { configuration: UIServerConfigurationSection; index: number }[]
}>()

defineEmits<{
  add: []
  'cycle-theme': []
  refresh: []
  'switch-server': [index: number]
  'toggle-simulator': []
}>()

const selectedIndex = ref(props.selectedServerIndex)

watch(
  () => props.selectedServerIndex,
  next => {
    selectedIndex.value = next
  }
)

const simulatorStarted = computed(() => props.simulatorState?.started === true)

const simulatorVariant = computed<'err' | 'idle' | 'ok'>(() => {
  if (props.simulatorState == null) return 'idle'
  return simulatorStarted.value ? 'ok' : 'err'
})

const simulatorLabel = computed(() => {
  if (props.simulatorState == null) return 'Disconnected'
  const version = props.simulatorState.version != null ? ` (${props.simulatorState.version})` : ''
  return `${simulatorStarted.value ? 'Running' : 'Stopped'}${version}`
})
</script>
