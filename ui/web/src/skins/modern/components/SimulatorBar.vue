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
      <select
        :value="activeTheme"
        class="v2-bar__select"
        aria-label="Theme"
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
      <select
        :value="activeSkinId"
        class="v2-bar__select"
        aria-label="Skin"
        @change="e => switchSkin((e.target as HTMLSelectElement).value)"
      >
        <option
          v-for="skin in skinList"
          :key="skin.id"
          :value="skin.id"
        >
          {{ skin.label }}
        </option>
      </select>
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
import { useSkin } from '@/shared/composables/useSkin.js'
import { type ThemeName, useTheme } from '@/shared/composables/useTheme.js'

import ActionButton from './ActionButton.vue'
import StatePill from './StatePill.vue'

const V1_ROUTE_NAME = ROUTE_NAMES.CHARGING_STATIONS

const { activeSkinId, skins: skinList, switchSkin } = useSkin()
const { activeTheme, availableThemes, setTheme } = useTheme()

const props = defineProps<{
  refreshPending?: boolean
  selectedServerIndex: number
  simulatorPending?: boolean
  simulatorState?: SimulatorState
  uiServerConfigurations: { configuration: UIServerConfigurationSection; index: number }[]
}>()

defineEmits<{
  add: []
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
