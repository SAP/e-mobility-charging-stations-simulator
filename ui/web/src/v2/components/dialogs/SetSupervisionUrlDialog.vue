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
          v-model.trim="form.supervisionUrl"
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
          v-model.trim="form.supervisionUser"
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
          v-model="form.supervisionPassword"
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
          v-model="form.reconnect"
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
        :pending="pending"
        @click="submit"
      >
        Save
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import { useChargingStations, useUIClient } from '@/composables'

import { V2_ROUTE_NAMES } from '../../composables/v2Constants'
import ActionButton from '../ActionButton.vue'
import Modal from '../Modal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const $uiClient = useUIClient()
const $chargingStations = useChargingStations()
const $router = useRouter()
const $toast = useToast()

const pending = ref(false)

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

const form = reactive({
  reconnect: true,
  supervisionPassword: currentStation?.stationInfo.supervisionPassword ?? '',
  supervisionUrl: stripStationId(
    currentStation?.supervisionUrl ?? '',
    currentStation?.stationInfo.chargingStationId ?? ''
  ),
  supervisionUser: currentStation?.stationInfo.supervisionUser ?? '',
})

const close = (): void => {
  $router.push({ name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS }).catch((error: unknown) => {
    console.error('Navigation failed:', error)
  })
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  if (form.supervisionUrl.length === 0) {
    $toast.error('Supervision URL is required')
    return
  }
  pending.value = true
  try {
    await $uiClient.setSupervisionUrl(
      props.hashId,
      form.supervisionUrl,
      form.supervisionUser,
      form.supervisionPassword
    )
    if (form.reconnect && currentStation?.started === true) {
      await $uiClient.closeConnection(props.hashId)
      await $uiClient.openConnection(props.hashId)
    }
    $toast.success('Supervision URL updated')
    close()
  } catch (error) {
    console.error('Error setting supervision URL:', error)
    $toast.error('Error setting supervision URL')
  } finally {
    pending.value = false
  }
}
</script>
