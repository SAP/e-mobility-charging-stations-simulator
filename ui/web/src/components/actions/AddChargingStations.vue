<template>
  <h1 class="action">
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
    @click="
      () => {
        $uiClient
          .addChargingStations(state.template, state.numberOfStations, {
            supervisionUrls: state.supervisionUrl.length > 0 ? state.supervisionUrl : undefined,
            autoStart: convertToBoolean(state.autoStart),
            persistentConfiguration: convertToBoolean(state.persistentConfiguration),
            ocppStrictCompliance: convertToBoolean(state.ocppStrictCompliance),
            enableStatistics: convertToBoolean(state.enableStatistics),
          })
          .then(() => {
            $toast.success('Charging stations successfully added')
          })
          .finally(() => {
            resetToggleButtonState('add-charging-stations', true)
            $router.push({ name: 'charging-stations' })
          })
          .catch((error: Error) => {
            $toast.error('Error at adding charging stations')
            console.error('Error at adding charging stations:', error)
          })
      }
    "
  >
    Add Charging Stations
  </Button>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { UUIDv4 } from '@/types'

import Button from '@/components/buttons/Button.vue'
import {
  convertToBoolean,
  randomUUID,
  resetToggleButtonState,
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
const $templates = useTemplates()

watch($templates, () => {
  state.value.renderTemplates = randomUUID()
})
</script>

<style scoped>
.action {
  min-width: max-content;
  color: var(--color-text-strong);
  background-color: var(--color-bg-caption);
  padding: var(--spacing-lg);
}

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
