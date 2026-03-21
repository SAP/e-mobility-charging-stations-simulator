<template>
  <h1 class="action">
    Set Supervision Url
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <p>Supervision Url:</p>
  <input
    id="supervision-url"
    v-model.trim="state.supervisionUrl"
    class="supervision-url"
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
            resetToggleButtonState(`${props.hashId}-set-supervision-url`, true)
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
import { resetToggleButtonState } from '@/composables'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const state = ref<{ supervisionUrl: string }>({
  supervisionUrl: '',
})
</script>

<style scoped>
.action {
  min-width: max-content;
  color: var(--color-text-strong);
  background-color: var(--color-bg-caption);
  padding: var(--spacing-lg);
}

.supervision-url {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}
</style>
