<template>
  <h1 id="action">Set Supervision Url</h1>
  <h2>{{ chargingStationId }}</h2>
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
    id="action-button"
    @click="
      () => {
        $uiClient
          .setSupervisionUrl(hashId, state.supervisionUrl)
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
  hashId: string
  chargingStationId: string
}>()

const state = ref<{ supervisionUrl: string }>({
  supervisionUrl: ''
})
</script>

<style>
#supervision-url {
  width: 90%;
  text-align: left;
}
</style>
