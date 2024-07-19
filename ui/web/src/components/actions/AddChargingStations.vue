<template>
  <h1 id="action">Add Charging Stations</h1>
  <p>Template:</p>
  <select :key="state.renderTemplates" v-model="state.template">
    <option disabled value="">Please select a template</option>
    <option
      v-for="template in $templates.value"
      v-show="Array.isArray($templates.value) && $templates.value.length > 0"
      :key="template"
    >
      {{ template }}
    </option>
  </select>
  <p>Number of stations:</p>
  <input
    id="number-of-stations"
    v-model="state.numberOfStations"
    type="number"
    min="1"
    name="number-of-stations"
    placeholder="number of stations"
  />
  <p>Template options overrides:</p>
  <ul id="template-options">
    <li>
      Supervision url:
      <input
        id="supervision-url"
        v-model.trim="state.supervisionUrl"
        type="url"
        name="supervision-url"
        placeholder="wss://"
      />
    </li>
    <li>
      Auto start:
      <input v-model="state.autoStart" type="checkbox" true-value="true" false-value="false" />
    </li>
    <li>
      Persistent configuration:
      <input
        v-model="state.persistentConfiguration"
        type="checkbox"
        true-value="true"
        false-value="false"
      />
    </li>
    <li>
      OCPP strict compliance:
      <input
        v-model="state.ocppStrictCompliance"
        type="checkbox"
        true-value="true"
        false-value="false"
      />
    </li>
    <li>
      Performance statistics:
      <input
        v-model="state.enableStatistics"
        type="checkbox"
        true-value="true"
        false-value="false"
      />
    </li>
  </ul>
  <br />
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
          .catch((error: Error) => {
            $toast.error('Error at adding charging stations')
            console.error('Error at adding charging stations:', error)
          })
          .finally(() => {
            $router.push({ name: 'charging-stations' })
          })
      }
    "
  >
    Add Charging Stations
  </Button>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref, watch } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { convertToBoolean, randomUUID } from '@/composables'

const state = ref<{
  renderTemplates: `${string}-${string}-${string}-${string}-${string}`
  template: string
  numberOfStations: number
  supervisionUrl: string
  autoStart: boolean
  persistentConfiguration: boolean
  ocppStrictCompliance: boolean
  enableStatistics: boolean
}>({
  renderTemplates: randomUUID(),
  template: '',
  numberOfStations: 1,
  supervisionUrl: '',
  autoStart: false,
  persistentConfiguration: true,
  ocppStrictCompliance: true,
  enableStatistics: false,
})

watch(getCurrentInstance()!.appContext.config.globalProperties.$templates, () => {
  state.value.renderTemplates = randomUUID()
})
</script>

<style>
#number-of-stations {
  width: 15%;
  text-align: center;
}

#supervision-url {
  width: 90%;
  text-align: left;
}

#template-options {
  list-style: circle inside;
  text-align: left;
}
</style>
