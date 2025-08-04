<template>
  <h1 id="action">
    Set Supervision Url
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <p>Supervision Url:</p>
  <input
    id="supervision-url"
    v-model.trim="state.supervisionUrl"
    name="supervision-url"
    placeholder="wss://"
    type="url"
  >
  <br>
  <Button
    id="action-button"
    @click="
      () => {
        $uiClient
          ?.setSupervisionUrl(hashId, state.supervisionUrl)
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
</template>

<script setup lang="ts">
import { ref } from 'vue'

import Button from '@/components/buttons/Button.vue'

defineProps<{
  chargingStationId: string
  hashId: string
}>()

const state = ref<{ supervisionUrl: string }>({
  supervisionUrl: '',
})
</script>

<style>
#supervision-url {
  text-align: left;
}
</style>
