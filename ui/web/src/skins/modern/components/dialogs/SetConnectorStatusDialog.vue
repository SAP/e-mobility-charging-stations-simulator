<template>
  <Modal
    :title="`Set connector status — ${chargingStationId}`"
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
          for="modern-connector-status-select"
        >Status</label>
        <select
          id="modern-connector-status-select"
          v-model="selectedStatus"
          class="modern-form__input"
        >
          <option
            v-for="s in statusOptions"
            :key="s"
            :value="s"
          >
            {{ s }}
          </option>
        </select>
        <span class="modern-form__hint"> The OCPP status to simulate on this connector. </span>
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
        :pending="pendingState.setStatus"
        @click="submit"
      >
        Set Status
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { OCPP16ChargePointStatus } from 'ui-common'
import { computed, ref } from 'vue'

import { useConnectorActions } from '@/shared/composables/useConnectorActions.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  connectorId: number
  evseId?: number
  hashId: string
  onRefresh?: () => void
}>()

const emit = defineEmits<{ close: [] }>()

const statusOptions = Object.values(OCPP16ChargePointStatus)
const selectedStatus = ref<OCPP16ChargePointStatus>(OCPP16ChargePointStatus.AVAILABLE)

const { pending: pendingState, setConnectorStatus } = useConnectorActions({
  connectorId: props.connectorId,
  evseId: props.evseId,
  hashId: props.hashId,
  onRefresh: props.onRefresh,
})

const targetLabel = computed(() =>
  props.evseId != null
    ? `EVSE ${String(props.evseId)} / Connector ${String(props.connectorId)}`
    : `Connector ${String(props.connectorId)}`
)

const close = (): void => {
  emit('close')
}

const submit = (): void => {
  if (pendingState.setStatus) return
  setConnectorStatus(selectedStatus.value)
  emit('close')
}
</script>
