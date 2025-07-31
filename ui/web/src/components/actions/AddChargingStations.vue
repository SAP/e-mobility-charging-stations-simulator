<template>
  <h1
    id="action"
    class="text-largest mb-default"
  >
    Add Charging Stations
  </h1>
  <div class="form-group">
    <label for="template-select">Template:</label>
    <select
      id="template-select"
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
        v-for="template in $templates!.value"
        v-show="Array.isArray($templates?.value) && $templates.value.length > 0"
        :key="template"
      >
        {{ template }}
      </option>
    </select>
  </div>

  <div class="form-group">
    <label for="number-of-stations">Number of stations:</label>
    <input
      id="number-of-stations"
      v-model="state.numberOfStations"
      min="1"
      name="number-of-stations"
      placeholder="Number of stations"
      type="number"
    >
  </div>
  <div class="form-section">
    <h3>Template Options Overrides</h3>
    <ul id="template-options">
      <li class="form-group">
        <label for="supervision-url">Supervision URL:</label>
        <input
          id="supervision-url"
          v-model.trim="state.supervisionUrl"
          name="supervision-url"
          placeholder="wss://"
          type="url"
        >
      </li>
      <li class="checkbox-group">
        <label for="auto-start">Auto start:</label>
        <input
          id="auto-start"
          v-model="state.autoStart"
          false-value="false"
          true-value="true"
          type="checkbox"
        >
      </li>
      <li class="checkbox-group">
        <label for="persistent-config">Persistent configuration:</label>
        <input
          id="persistent-config"
          v-model="state.persistentConfiguration"
          false-value="false"
          true-value="true"
          type="checkbox"
        >
      </li>
      <li class="checkbox-group">
        <label for="ocpp-compliance">OCPP strict compliance:</label>
        <input
          id="ocpp-compliance"
          v-model="state.ocppStrictCompliance"
          false-value="false"
          true-value="true"
          type="checkbox"
        >
      </li>
      <li class="checkbox-group">
        <label for="performance-stats">Performance statistics:</label>
        <input
          id="performance-stats"
          v-model="state.enableStatistics"
          false-value="false"
          true-value="true"
          type="checkbox"
        >
      </li>
    </ul>
  </div>
  <div class="button-container">
    <Button
      id="action-button"
      appearance="brand"
      @click="
        () => {
          $uiClient
            ?.addChargingStations(state.template, state.numberOfStations, {
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
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref, watch } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { convertToBoolean, randomUUID } from '@/composables'

const state = ref<{
  autoStart: boolean
  enableStatistics: boolean
  numberOfStations: number
  ocppStrictCompliance: boolean
  persistentConfiguration: boolean
  renderTemplates: `${string}-${string}-${string}-${string}-${string}`
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

watch(getCurrentInstance()!.appContext.config.globalProperties!.$templates, () => {
  state.value.renderTemplates = randomUUID()
})
</script>

<style>
/* Base styles for all form elements */
select, input[type="number"], input[type="url"], input[type="checkbox"] {
  padding: 8px;
  margin: 4px 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  transition: all 0.3s ease;
  font-size: 14px;
}

/* Form layout and section styles */
.form-group, .checkbox-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

.form-section {
  margin: 24px 0;
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.form-section h3 {
  font-size: 18px;
  margin-bottom: 16px;
  color: #333;
}

/* Labels */
label {
  font-weight: 500;
  margin-bottom: 6px;
  color: #555;
}

/* Select element styles */
select {
  width: 100%;
  cursor: pointer;
  background-color: #fafafa;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

/* Hover and focus states */
select:hover, input[type="number"]:hover, input[type="url"]:hover {
  border-color: #888;
  background-color: #f5f5f5;
}

select:focus, input[type="number"]:focus, input[type="url"]:focus {
  border-color: #f48121;
  outline: none;
  box-shadow: 0 0 5px rgba(74, 144, 226, 0.3);
  background-color: #fff;
}

/* Number input specific styles */
#number-of-stations {
  text-align: center;
}

/* URL input specific styles */
#supervision-url {
  width: 100%;
  max-width: 400px;
  text-align: left;
}

/* Template options list */
#template-options {
  list-style: none;
  text-align: left;
  padding-left: 0;
}

#template-options li {
  margin: 12px 0;
  padding: 8px 0;
}

/* Checkbox styles */
.checkbox-group {
  flex-direction: row;
  align-items: center;
}

.checkbox-group label {
  margin-bottom: 0;
  margin-right: 12px;
}

input[type="checkbox"] {
  cursor: pointer;
  width: 18px;
  height: 18px;
  position: relative;
  top: 2px;
  accent-color: #f48121;
}

/* Button container and styling */
.button-container {
  margin-top: 24px;
  text-align: center;
}

#action-button {
  margin-top: 16px;
  min-width: 200px;
}

</style>
