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
      Base name:
      <input
        id="base-name"
        v-model.trim="state.baseName"
        class="base-name"
        name="base-name"
        placeholder="<template value>"
        type="text"
      >
      Append counter to name:
      <input
        v-model="state.appendCounter"
        false-value="false"
        true-value="true"
        type="checkbox"
      >
    </li>
    <li>
      Supervision url:
      <input
        id="supervision-url"
        v-model.trim="state.supervisionUrl"
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
        v-model.trim="state.supervisionUser"
        autocomplete="off"
        class="supervision-user"
        name="supervision-user"
        placeholder="<username>"
        type="text"
      >
      <input
        id="supervision-password"
        v-model="state.supervisionPassword"
        class="supervision-password"
        name="supervision-password"
        placeholder="<password>"
        type="password"
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
import { convertToBoolean, randomUUID, type UUIDv4 } from 'ui-common'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Button from '@/components/buttons/Button.vue'
import {
  resetToggleButtonState,
  ROUTE_NAMES,
  useExecuteAction,
  useTemplates,
  useUIClient,
} from '@/composables'

const state = ref<{
  appendCounter: boolean
  autoStart: boolean
  baseName: string
  enableStatistics: boolean
  numberOfStations: number
  ocppStrictCompliance: boolean
  persistentConfiguration: boolean
  renderTemplates: UUIDv4
  supervisionPassword: string
  supervisionUrl: string
  supervisionUser: string
  template: string
}>({
  appendCounter: true,
  autoStart: false,
  baseName: '',
  enableStatistics: false,
  numberOfStations: 1,
  ocppStrictCompliance: true,
  persistentConfiguration: true,
  renderTemplates: randomUUID(),
  supervisionPassword: '',
  supervisionUrl: '',
  supervisionUser: '',
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
      baseName: state.value.baseName.length > 0 ? state.value.baseName : undefined,
      enableStatistics: convertToBoolean(state.value.enableStatistics),
      fixedName:
        state.value.baseName.length > 0 && !convertToBoolean(state.value.appendCounter)
          ? true
          : undefined,
      ocppStrictCompliance: convertToBoolean(state.value.ocppStrictCompliance),
      persistentConfiguration: convertToBoolean(state.value.persistentConfiguration),
      supervisionPassword:
        state.value.supervisionPassword.length > 0 ? state.value.supervisionPassword : undefined,
      supervisionUrls:
        state.value.supervisionUrl.length > 0 ? state.value.supervisionUrl : undefined,
      supervisionUser:
        state.value.supervisionUser.length > 0 ? state.value.supervisionUser : undefined,
    }),
    'Charging stations successfully added',
    'Error at adding charging stations',
    {
      onFinally: () => {
        resetToggleButtonState('add-charging-stations', true)
        $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
      },
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

.supervision-url,
.base-name,
.supervision-user,
.supervision-password {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}

.template-options {
  list-style: circle;
  text-align: left;
}
</style>
