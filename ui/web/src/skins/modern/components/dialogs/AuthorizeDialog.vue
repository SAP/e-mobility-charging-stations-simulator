<template>
  <Modal
    :title="`Authorize — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="modern-form"
      @submit.prevent="submit"
    >
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-auth-tag"
        >RFID / ID Tag</label>
        <input
          id="modern-auth-tag"
          v-model.trim="idTag"
          class="modern-form__input"
          type="text"
          autocomplete="off"
          placeholder="e.g. RFID-1234"
        >
        <span class="modern-form__hint">
          Sends a standalone Authorize request for this tag. Does not start a transaction.
        </span>
      </div>
      <div
        v-if="lastFailure != null"
        class="modern-form__error"
      >
        <div class="modern-form__error-summary">
          <strong>Status</strong>
          <span>{{ lastFailure.summary }}</span>
        </div>
        <details
          v-if="lastFailure.payload != null"
          class="modern-form__error-details"
        >
          <summary>Response JSON</summary>
          <pre class="modern-form__error-json">{{ formattedPayload }}</pre>
        </details>
      </div>
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
        Authorize
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/core'

import { type FailureInfo, getFailureInfo } from '../../utils/errors.js'
import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const emit = defineEmits<{ close: [] }>()

const $uiClient = useUIClient()
const $toast = useToast()

const pending = ref(false)
const lastFailure = ref<FailureInfo | null>(null)

const idTag = ref('')

const formattedPayload = computed(() =>
  lastFailure.value?.payload != null ? JSON.stringify(lastFailure.value.payload, null, 2) : ''
)

const close = (): void => {
  emit('close')
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  if (idTag.value.length === 0) {
    $toast.error('Provide an RFID tag')
    return
  }
  pending.value = true
  lastFailure.value = null
  try {
    await $uiClient.authorize(props.hashId, idTag.value)
    $toast.success(`Authorized ${idTag.value}`)
    close()
  } catch (error) {
    console.error('Error authorizing:', error)
    const info = getFailureInfo(error)
    lastFailure.value = info
    $toast.error(`Authorize failed: ${info.summary}`)
  } finally {
    pending.value = false
  }
}
</script>
