<template>
  <h1 class="classic-action-header">
    Set Supervision Url
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <p>Supervision url:</p>
  <input
    id="supervision-url"
    v-model.trim="formState.supervisionUrl"
    class="input-url"
    name="supervision-url"
    placeholder="wss://"
    type="url"
  >
  <p>Supervision credentials:</p>
  <input
    id="supervision-user"
    v-model.trim="formState.supervisionUser"
    autocomplete="off"
    class="classic-supervision-user"
    name="supervision-user"
    placeholder="<username>"
    type="text"
  >
  <input
    id="supervision-password"
    v-model="formState.supervisionPassword"
    autocomplete="off"
    class="classic-supervision-password"
    name="supervision-password"
    placeholder="<password>"
    type="password"
  >
  <br>
  <Button
    id="action-button"
    :disabled="pending"
    @click="setSupervisionUrl()"
  >
    Set Supervision Url
  </Button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import { resetToggleButtonState, ROUTE_NAMES } from '@/core'
import { useSetUrlForm } from '@/shared/composables/useSetUrlForm.js'

import Button from '../buttons/ClassicButton.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const { formState, pending, submitForm } = useSetUrlForm(props.hashId, props.chargingStationId)
const $router = useRouter()

const setSupervisionUrl = async (): Promise<void> => {
  const success = await submitForm()
  if (success) {
    resetToggleButtonState(`${props.hashId}-set-supervision-url`, true)
    $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
  }
}
</script>

<style scoped>
.classic-supervision-user,
.classic-supervision-password {
  width: 100%;
  max-width: 40rem;
  text-align: left;
}
</style>
