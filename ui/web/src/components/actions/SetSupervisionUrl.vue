<template>
  <h2>Action Set Supervision Url</h2>
  <h3>Charging Station {{ chargingStationId }}</h3>
  <p>Supervision Url:</p>
  <input
    id="supervision-url"
    v-model.trim="state.supervisionUrl"
    type="url"
    name="supervision-url"
    placeholder="wss://"
  />
  <br />
  <Button
    @click="
      () => {
        uiClient
          .setSupervisionUrl(props.hashId, state.supervisionUrl)
          .then(() => {
            $toast.success('Supervision url successfully set')
          })
          .catch((error: Error) => {
            $toast.error('Error at setting supervision url')
            console.error('Error at setting supervision url:', error)
          })
          .finally(() => {
            $router.push({ name: 'charging-stations' })
          })
      }
    "
  >
    Set Supervision Url
  </Button>
  <Button @click="$router.push({ name: 'charging-stations' })">Cancel</Button>
</template>

<script setup lang="ts">
import { getCurrentInstance, reactive } from 'vue'
import Button from '@/components/buttons/Button.vue'

const props = defineProps<{
  hashId: string
  chargingStationId: string
}>()

const state = reactive({
  supervisionUrl: ''
})

const uiClient = getCurrentInstance()?.appContext.config.globalProperties.$uiClient
</script>

<style>
#supervision-url {
  width: 90%;
  text-align: left;
}
</style>
