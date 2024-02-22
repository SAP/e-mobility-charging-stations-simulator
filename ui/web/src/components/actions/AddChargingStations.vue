<template>
  <h1 id="action">Action</h1>
  <h2>Add Charging Stations</h2>
  <p>Template:</p>
  <select v-show="state.ready" v-model="state.template">
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
  <p>Options:</p>
  <ul>
    <li>
      Auto start:
      <input v-model="state.autoStart" type="checkbox" true-value="true" false-value="false" />
    </li>
  </ul>
  <br />
  <Button
    id="action-button"
    @click="
      () => {
        uiClient
          .addChargingStations(state.template, state.numberOfStations, {
            autoStart: convertToBoolean(state.autoStart)
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
import { getCurrentInstance, onMounted, reactive } from 'vue'
import { useToast } from 'vue-toast-notification'
import Button from '@/components/buttons/Button.vue'
import type { ResponsePayload } from '@/types'
import { convertToBoolean } from '@/composables'

const state = reactive({
  ready: false,
  template: '',
  numberOfStations: 1,
  autoStart: false
})

const app = getCurrentInstance()
const uiClient = app?.appContext.config.globalProperties.$uiClient

const $toast = useToast()

onMounted(() => {
  uiClient
    .listTemplates()
    .then((response: ResponsePayload) => {
      if (app != null && app.appContext.config.globalProperties.$templates == null) {
        app.appContext.config.globalProperties.$templates = response.templates
      }
    })
    .catch((error: Error) => {
      $toast.error('Error at fetching charging station templates')
      console.error('Error at fetching charging station templates:', error)
    })
    .finally(() => {
      state.ready = true
    })
})
</script>

<style>
#number-of-stations {
  width: 15%;
  text-align: center;
}
</style>
