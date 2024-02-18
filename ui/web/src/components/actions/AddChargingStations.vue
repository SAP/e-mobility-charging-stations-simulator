<template>
  <h2>Action Add Charging Stations</h2>
  <p>Template:</p>
  <select v-if="state.ready" v-model="state.template">
    <option v-for="template in app?.appContext.config.globalProperties.$templates">
      {{ template }}
    </option>
  </select>
  <p>Number of stations:</p>
  <input
    id="number-of-stations"
    v-model="state.numberOfStations"
    type="text"
    name="number-of-stations"
    placeholder="number of stations"
  />
  <br />
  <Button
    @click="
      () => {
        uiClient
          .addChargingStations(state.template, state.numberOfStations)
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
    >Add Charging Stations</Button
  >
  <Button @click="$router.push({ name: 'charging-stations' })">Cancel</Button>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, reactive } from 'vue'
import { useToast } from 'vue-toast-notification'
import Button from '@/components/buttons/Button.vue'
import type { ResponsePayload } from '@/types'

const state = reactive({
  ready: false,
  template: '',
  numberOfStations: 1
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
  text-align: center;
}
</style>
