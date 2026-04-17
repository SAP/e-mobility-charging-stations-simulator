<template>
  <h1 class="action-header">
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
    @click="setSupervisionUrl()"
  >
    Set Supervision Url
  </Button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import Button from '@/components/buttons/Button.vue'
import { resetToggleButtonState, ROUTE_NAMES, useExecuteAction, useUIClient } from '@/composables'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const state = ref<{ supervisionUrl: string }>({
  supervisionUrl: '',
})

const $uiClient = useUIClient()
const $router = useRouter()
const executeAction = useExecuteAction()

const setSupervisionUrl = (): void => {
  executeAction(
    $uiClient.setSupervisionUrl(props.hashId, state.value.supervisionUrl),
    'Supervision url successfully set',
    'Error at setting supervision url',
    () => {
      resetToggleButtonState(`${props.hashId}-set-supervision-url`, true)
      $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
    }
  )
}
</script>

<style scoped>
.supervision-url {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}
</style>
