<template>
  <h1 class="classic-action-header">
    Add Charging Stations
  </h1>
  <p>Template:</p>
  <select
    :key="formState.renderTemplates"
    v-model="formState.template"
  >
    <option
      disabled
      value=""
    >
      Please select a template
    </option>
    <option
      v-for="template in templates"
      :key="template"
    >
      {{ template }}
    </option>
  </select>
  <p>Number of stations:</p>
  <input
    id="number-of-stations"
    v-model="formState.numberOfStations"
    class="classic-number-of-stations"
    max="100"
    min="1"
    name="number-of-stations"
    placeholder="number of stations"
    type="number"
  >
  <p>Template options overrides:</p>
  <ul class="classic-template-options">
    <li>
      Base name:
      <input
        id="base-name"
        v-model.trim="formState.baseName"
        class="classic-base-name"
        name="base-name"
        placeholder="<template value>"
        type="text"
      >
      Fixed name:
      <input
        v-model="formState.fixedName"
        type="checkbox"
      >
    </li>
    <li>
      Supervision url:
      <input
        id="supervision-url"
        v-model.trim="formState.supervisionUrl"
        class="input-url"
        name="supervision-url"
        placeholder="wss://"
        type="url"
      >
    </li>
    <li>
      Supervision credentials:
      <input
        id="supervision-user"
        v-model.trim="formState.supervisionUser"
        autocomplete="off"
        class="classic-supervision-user"
        name="supervision-user"
        placeholder="<username>"
        type="text"
      >
      <input
        id="supervision-password"
        v-model="formState.supervisionPassword"
        autocomplete="off"
        class="classic-supervision-password"
        name="supervision-password"
        placeholder="<password>"
        type="password"
      >
    </li>
    <li>
      Auto start:
      <input
        v-model="formState.autoStart"
        type="checkbox"
      >
    </li>
    <li>
      Persistent configuration:
      <input
        v-model="formState.persistentConfiguration"
        type="checkbox"
      >
    </li>
    <li>
      OCPP strict compliance:
      <input
        v-model="formState.ocppStrictCompliance"
        type="checkbox"
      >
    </li>
    <li>
      Performance statistics:
      <input
        v-model="formState.enableStatistics"
        type="checkbox"
      >
    </li>
  </ul>
  <br>
  <Button
    id="action-button"
    :disabled="pending"
    @click="addChargingStations()"
  >
    Add Charging Stations
  </Button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import { resetToggleButtonState, ROUTE_NAMES } from '@/composables'
import { useAddStationsForm } from '@/shared/composables/useAddStationsForm.js'

import Button from '../buttons/ClassicButton.vue'

const $router = useRouter()

const { formState, pending, submitForm, templates } = useAddStationsForm({
  onFinally: () => {
    resetToggleButtonState('add-charging-stations', true)
    $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
  },
})

const addChargingStations = async (): Promise<void> => {
  await submitForm()
}
</script>

<style scoped>
.classic-number-of-stations {
  width: auto;
  max-width: 6rem;
  text-align: center;
}

.classic-base-name,
.classic-supervision-user,
.classic-supervision-password {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}

.classic-template-options {
  list-style: circle;
  text-align: left;
}
</style>
