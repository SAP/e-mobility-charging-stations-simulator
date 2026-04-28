<template>
  <Modal
    :title="`Start transaction — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="v2-form"
      @submit.prevent="submit"
    >
      <p style="margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm)">
        {{ targetLabel }}
      </p>
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-tx-idtag"
        >RFID tag</label>
        <input
          id="v2-tx-idtag"
          v-model.trim="formState.idTag"
          class="v2-form__input"
          type="text"
          placeholder="optional"
        >
      </div>
      <label class="v2-form__check">
        <input
          v-model="formState.authorizeIdTag"
          type="checkbox"
        >
        Authorize the RFID tag first
      </label>
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

import { computed, ref } from 'vue'

import { useStartTxForm } from '@/shared/composables/useStartTxForm.js'

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

const { formState, submitForm } = useStartTxForm(
  props.hashId,
  props.connectorId,
  props.evseId,
  props.ocppVersion
)

const targetLabel = computed(() =>
  props.evseId != null
    ? `EVSE ${String(props.evseId)} / Connector ${props.connectorId}`
    : `Connector ${props.connectorId}`
)

const close = (): void => {
  emit('close')
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  pending.value = true
  const success = await submitForm()
  pending.value = false
  if (success) emit('close')
}
</script>
