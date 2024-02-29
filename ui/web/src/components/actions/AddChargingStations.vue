<template>
  <h1 id="action">Action</h1>
  <h2>Add Charging Stations</h2>
  <p>Template:</p>
  <select
    v-show="
      Array.isArray(app?.appContext.config.globalProperties.$templates) &&
      app?.appContext.config.globalProperties.$templates.length > 0
    "
    v-model="state.template"
  >
    <option disabled value="">Please select a template</option>
    <option v-for="template in app?.appContext.config.globalProperties.$templates">
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
  <ul>
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
        uiClient
          .addChargingStations(state.template, state.numberOfStations, {
            supervisionUrls: state.supervisionUrl.length > 0 ? state.supervisionUrl : undefined,
            autoStart: convertToBoolean(state.autoStart),
            persistentConfiguration: convertToBoolean(state.persistentConfiguration),
            ocppStrictCompliance: convertToBoolean(state.ocppStrictCompliance),
            enableStatistics: convertToBoolean(state.enableStatistics)
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
  <Button id="action-button" @click="$router.push({ name: 'charging-stations' })">Cancel</Button>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref } from 'vue'
import { useToast } from 'vue-toast-notification'
import Button from '@/components/buttons/Button.vue'
import { convertToBoolean } from '@/composables'

const state = ref({
  template: '',
  numberOfStations: 1,
  supervisionUrl: '',
  autoStart: false,
  persistentConfiguration: true,
  ocppStrictCompliance: true,
  enableStatistics: false
})

const app = getCurrentInstance()
const uiClient = app?.appContext.config.globalProperties.$uiClient

const $toast = useToast()
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
</style>
