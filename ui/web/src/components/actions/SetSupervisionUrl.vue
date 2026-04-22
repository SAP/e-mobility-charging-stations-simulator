<template>
  <h1 class="action-header">
    Set Supervision Url
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <p>Supervision url:</p>
  <input
    id="supervision-url"
    v-model.trim="state.supervisionUrl"
    class="input-url"
    name="supervision-url"
    placeholder="wss://"
    type="url"
  >
  <p>Supervision credentials:</p>
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
import { useToast } from 'vue-toast-notification'

import Button from '@/components/buttons/Button.vue'
import { resetToggleButtonState, ROUTE_NAMES, useExecuteAction, useUIClient } from '@/composables'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const state = ref<{
  supervisionPassword: string
  supervisionUrl: string
  supervisionUser: string
}>({
  supervisionPassword: '',
  supervisionUrl: '',
  supervisionUser: '',
})

const $uiClient = useUIClient()
const $router = useRouter()
const $toast = useToast()
const executeAction = useExecuteAction()

const setSupervisionUrl = (): void => {
  if (
    state.value.supervisionUrl.length === 0 &&
    state.value.supervisionUser.length === 0 &&
    state.value.supervisionPassword.length === 0
  ) {
    $toast.error('At least one of url, user or password must be set')
    return
  }
  executeAction(
    $uiClient.setSupervisionUrl(
      props.hashId,
      state.value.supervisionUrl.length > 0 ? state.value.supervisionUrl : undefined,
      state.value.supervisionUser.length > 0 ? state.value.supervisionUser : undefined,
      state.value.supervisionPassword.length > 0 ? state.value.supervisionPassword : undefined
    ),
    'Supervision url successfully set',
    'Error at setting supervision url',
    {
      onFinally: () => {
        resetToggleButtonState(`${props.hashId}-set-supervision-url`, true)
        $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
      },
    }
  )
}
</script>

<style scoped>
.supervision-url,
.supervision-user,
.supervision-password {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}
</style>
