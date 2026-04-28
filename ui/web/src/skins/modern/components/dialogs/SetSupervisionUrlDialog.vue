<template>
  <Modal
    :title="`Supervision URL — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="v2-form"
      @submit.prevent="submit"
    >
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-sup-url"
        >Supervision URL</label>
        <input
          id="v2-sup-url"
          v-model.trim="formState.supervisionUrl"
          class="v2-form__input"
          type="url"
          placeholder="wss://..."
          required
        >
      </div>
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-sup-user"
        >Username</label>
        <input
          id="v2-sup-user"
          v-model.trim="formState.supervisionUser"
          class="v2-form__input"
          type="text"
          placeholder="Username"
        >
      </div>
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-sup-pass"
        >Password</label>
        <input
          id="v2-sup-pass"
          v-model="formState.supervisionPassword"
          class="v2-form__input"
          type="password"
          placeholder="Password"
        >
        <span class="v2-form__hint">
          Credentials are sent verbatim; leaving username or password empty clears the stored value.
        </span>
      </div>
      <label class="v2-form__check">
        <input
          v-model="reconnect"
          type="checkbox"
        >
        Reconnect after saving
      </label>
      <span class="v2-form__hint">
        New credentials only take effect on the next CSMS connection. Leave this checked to drop
        &amp; reopen the existing connection.
      </span>
    </form>
    <template #footer>
      <ActionButton
        variant="ghost"
        @click="close"
      >
        Cancel
      </ActionButton>
      <ActionButton
        variant="primary"
        @click="submit"
      >
        Save
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { useChargingStations, useUIClient } from '@/composables'
import { useSetUrlForm } from '@/shared/composables/useSetUrlForm.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../Modal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const emit = defineEmits<{ close: [] }>()

const { formState, submitForm } = useSetUrlForm(props.hashId, props.chargingStationId)
const $uiClient = useUIClient()
const $chargingStations = useChargingStations()

const reconnect = ref(true)

const currentStation = $chargingStations.value.find(
  station => station.stationInfo.hashId === props.hashId
)

// The backend broadcasts `supervisionUrl` as the final wsConnectionUrl —
// i.e. `<base>/<chargingStationId>`. If we prefilled that into the form
// and the user saved it back, the backend would append the id a second
// time on next connect. Strip the trailing id segment so the user only
// ever edits the base URL.
const stripStationId = (url: string, stationId: string): string => {
  if (stationId.length === 0) return url
  const suffix = `/${stationId}`
  return url.endsWith(suffix) ? url.slice(0, -suffix.length) : url
}

// Pre-fill from current station data
formState.value.supervisionUrl = stripStationId(
  currentStation?.supervisionUrl ?? '',
  currentStation?.stationInfo.chargingStationId ?? ''
)
formState.value.supervisionUser = currentStation?.stationInfo.supervisionUser ?? ''
formState.value.supervisionPassword = currentStation?.stationInfo.supervisionPassword ?? ''

const close = (): void => {
  emit('close')
}

const submit = (): void => {
  submitForm()
  if (formState.value.supervisionUrl.length > 0) {
    if (reconnect.value && currentStation?.started === true) {
      $uiClient
        .closeConnection(props.hashId)
        .then(() => $uiClient.openConnection(props.hashId))
        .catch((error: unknown) => {
          console.error('Error reconnecting:', error)
        })
    }
    close()
  }
}
</script>
