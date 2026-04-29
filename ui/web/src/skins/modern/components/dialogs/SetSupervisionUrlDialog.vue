<template>
  <Modal
    :title="`Supervision URL — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="modern-form"
      @submit.prevent="submit"
    >
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-sup-url"
        >Supervision URL</label>
        <input
          id="modern-sup-url"
          v-model.trim="formState.supervisionUrl"
          class="modern-form__input"
          type="url"
          placeholder="wss://..."
          required
        >
      </div>
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-sup-user"
        >Username</label>
        <input
          id="modern-sup-user"
          v-model.trim="formState.supervisionUser"
          class="modern-form__input"
          type="text"
          placeholder="Username"
        >
      </div>
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-sup-pass"
        >Password</label>
        <input
          id="modern-sup-pass"
          v-model="formState.supervisionPassword"
          class="modern-form__input"
          type="password"
          placeholder="Password"
        >
        <span class="modern-form__hint">
          Credentials are sent verbatim; leaving username or password empty clears the stored value.
        </span>
      </div>
      <label class="modern-form__check">
        <input
          v-model="reconnect"
          type="checkbox"
        >
        Reconnect after saving
      </label>
      <span class="modern-form__hint">
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
import { computed, ref, watch } from 'vue'

import { useChargingStations, useUIClient } from '@/composables'
import { useSetUrlForm } from '@/shared/composables/useSetUrlForm.js'
import { stripStationId } from '@/shared/utils/stripStationId.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const emit = defineEmits<{ close: [] }>()

const { formState, pending, submitForm } = useSetUrlForm(props.hashId, props.chargingStationId)
const $uiClient = useUIClient()
const $chargingStations = useChargingStations()

const reconnect = ref(true)

const currentStation = computed(() =>
  $chargingStations.value.find(station => station.stationInfo.hashId === props.hashId)
)

watch(
  currentStation,
  station => {
    if (station != null) {
      formState.value.supervisionUrl = stripStationId(
        station.supervisionUrl ?? '',
        station.stationInfo.chargingStationId ?? ''
      )
      formState.value.supervisionUser = station.stationInfo.supervisionUser ?? ''
      formState.value.supervisionPassword = station.stationInfo.supervisionPassword ?? ''
    }
  },
  { immediate: true }
)

const close = (): void => {
  emit('close')
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  try {
    const success = await submitForm()
    if (!success) return
    if (reconnect.value && currentStation.value?.started === true) {
      await $uiClient.closeConnection(props.hashId)
      await $uiClient.openConnection(props.hashId)
    }
    close()
  } catch {
    // submitForm handles its own errors via toast
  }
}
</script>
