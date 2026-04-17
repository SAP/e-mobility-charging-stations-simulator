<template>
  <h1 class="action-header">
    Add Charging Stations
  </h1>
  <p>Template:</p>
  <select
    :key="state.renderTemplates"
    v-model="state.template"
  >
    <option
      disabled
      value=""
    >
      Please select a template
    </option>
    <option
      v-for="template in $templates"
      v-show="Array.isArray($templates) && $templates.length > 0"
      :key="template"
    >
      {{ template }}
    </option>
  </select>
  <p>Number of stations:</p>
  <input
    id="number-of-stations"
    v-model="state.numberOfStations"
    class="number-of-stations"
    min="1"
    name="number-of-stations"
    placeholder="number of stations"
    type="number"
  >
  <p>Template options overrides:</p>
  <ul class="template-options">
    <li>
      Supervision url:
      <input
        id="supervision-url"
        v-model.trim="state.supervisionUrl"
        class="supervision-url"
        name="supervision-url"
        placeholder="wss://"
        type="url"
      >
    </li>
    <li>
      Auto start:
      <input
        v-model="state.autoStart"
        false-value="false"
        true-value="true"
        type="checkbox"
      >
    </li>
    <li>
      Persistent configuration:
      <input
        v-model="state.persistentConfiguration"
        false-value="false"
        true-value="true"
        type="checkbox"
      >
    </li>
    <li>
      OCPP strict compliance:
      <input
        v-model="state.ocppStrictCompliance"
        false-value="false"
        true-value="true"
        type="checkbox"
      >
    </li>
    <li>
      Performance statistics:
      <input
        v-model="state.enableStatistics"
        false-value="false"
        true-value="true"
        type="checkbox"
      >
    </li>
  </ul>
  <br>
  <Button
    id="action-button"
    @click="addChargingStations()"
  >
    Add Charging Stations
  </Button>
</template>

<script setup lang="ts">
import type { UUIDv4 } from 'ui-common'

import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Button from '@/components/buttons/Button.vue'
import {
  convertToBoolean,
  randomUUID,
  resetToggleButtonState,
  ROUTE_NAMES,
  useExecuteAction,
  useTemplates,
  useUIClient,
} from '@/composables'

const state = ref<{
  autoStart: boolean
  enableStatistics: boolean
  numberOfStations: number
  ocppStrictCompliance: boolean
  persistentConfiguration: boolean
  renderTemplates: UUIDv4
  supervisionUrl: string
  template: string
}>({
  autoStart: false,
  enableStatistics: false,
  numberOfStations: 1,
  ocppStrictCompliance: true,
  persistentConfiguration: true,
  renderTemplates: randomUUID(),
  supervisionUrl: '',
  template: '',
})

const $uiClient = useUIClient()
const $router = useRouter()
const $templates = useTemplates()
const executeAction = useExecuteAction()

watch($templates, () => {
  state.value.renderTemplates = randomUUID()
})

const addChargingStations = (): void => {
  executeAction(
    $uiClient.addChargingStations(state.value.template, state.value.numberOfStations, {
      autoStart: convertToBoolean(state.value.autoStart),
      enableStatistics: convertToBoolean(state.value.enableStatistics),
      ocppStrictCompliance: convertToBoolean(state.value.ocppStrictCompliance),
      persistentConfiguration: convertToBoolean(state.value.persistentConfiguration),
      supervisionUrls:
        state.value.supervisionUrl.length > 0 ? state.value.supervisionUrl : undefined,
    }),
    'Charging stations successfully added',
    'Error at adding charging stations',
    () => {
      resetToggleButtonState('add-charging-stations', true)
      $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
    }
  )
}
</script>

<style scoped>
.number-of-stations {
  width: auto;
  max-width: 6rem;
  text-align: center;
}

.supervision-url {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}

.template-options {
  list-style: circle inside;
  text-align: left;
}
</style>
