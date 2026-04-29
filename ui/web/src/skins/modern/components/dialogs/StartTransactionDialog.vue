<template>
  <Modal
    :title="`Start transaction — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="modern-form"
      @submit.prevent="submit"
    >
      <p class="modern-dialog__target-label">
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
          <strong>{{
            errorStep === 'authorize'
              ? 'Authorize failed'
              : errorStep === 'startTransaction'
                ? 'Start transaction failed'
                : 'Status'
          }}</strong>
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
const errorStep = ref<'authorize' | 'startTransaction' | null>(null)

const isMounted = ref(true)
onBeforeUnmount(() => {
  isMounted.value = false
})

const { formState, submitForm } = useStartTxForm({
  connectorId: props.connectorId,
  evseId: props.evseId,
  hashId: props.hashId,
  ocppVersion: props.ocppVersion,
  options: {
    onError: (error: unknown, step?: 'authorize' | 'startTransaction') => {
      errorStep.value = step ?? null
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
    errorStep.value = null
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
    if (isMounted.value && success) emit('close')
  } finally {
    if (isMounted.value) {
      pending.value = false
    }
  }
}
</script>
