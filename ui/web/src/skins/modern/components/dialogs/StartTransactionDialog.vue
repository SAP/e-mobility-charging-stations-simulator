<template>
  <Modal
    :title="`Start transaction — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="modern-form"
      @submit.prevent="submit"
    >
      <p style="margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm)">
        {{ targetLabel }}
      </p>
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-tx-idtag"
        >RFID tag</label>
        <input
          id="modern-tx-idtag"
          v-model.trim="formState.idTag"
          class="modern-form__input"
          type="text"
          placeholder="optional"
        >
      </div>
      <label class="modern-form__check">
        <input
          v-model="formState.authorizeIdTag"
          type="checkbox"
        >
        Authorize the RFID tag first
      </label>
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
        Start
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type { OCPPVersion } from 'ui-common'

import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useStartTxForm } from '@/shared/composables/useStartTxForm.js'

import { type FailureInfo, getFailureInfo } from '../../utils/errors'
import ActionButton from '../ActionButton.vue'
import Modal from '../Modal.vue'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>()

const emit = defineEmits<{ close: [] }>()

const pending = ref(false)
const lastFailure = ref<FailureInfo | null>(null)

let cancelled = false
onBeforeUnmount(() => {
  cancelled = true
})

const { formState, submitForm } = useStartTxForm({
  connectorId: props.connectorId,
  evseId: props.evseId,
  hashId: props.hashId,
  ocppVersion: props.ocppVersion,
  options: {
    onError: (error: unknown) => {
      lastFailure.value = getFailureInfo(error)
    },
  },
})

const targetLabel = computed(() =>
  props.evseId != null
    ? `EVSE ${String(props.evseId)} / Connector ${props.connectorId}`
    : `Connector ${props.connectorId}`
)

const formattedPayload = computed(() =>
  lastFailure.value?.payload != null ? JSON.stringify(lastFailure.value.payload, null, 2) : ''
)

watch(
  formState,
  () => {
    lastFailure.value = null
  },
  { deep: true }
)

const close = (): void => {
  emit('close')
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  pending.value = true
  lastFailure.value = null
  try {
    const success = await submitForm()
    if (cancelled) return
    if (success) emit('close')
  } finally {
    pending.value = false
  }
}
</script>
