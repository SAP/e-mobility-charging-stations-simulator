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
      <div
        v-if="!isOCPP20x(ocppVersion)"
        class="modern-form__row"
      >
        <label
          class="modern-form__label"
          for="modern-connector-error-code-select"
        >Error Code</label>
        <select
          id="modern-connector-error-code-select"
          v-model="selectedErrorCode"
          class="modern-form__input"
        >
          <option
            v-for="e in errorCodeOptions"
            :key="e"
            :value="e"
          >
            {{ e }}
          </option>
        </select>
        <span class="modern-form__hint"> OCPP 1.6 error code to simulate (NoError = normal). </span>
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
import type { ChargePointStatus, OCPPVersion } from 'ui-common'

import {
  isOCPP20x,
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  OCPP20ConnectorStatusEnumType,
} from 'ui-common'
import { computed, ref } from 'vue'

import { useConnectorActions } from '@/shared/composables/useConnectorActions.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  connectorId: number
  currentErrorCode?: OCPP16ChargePointErrorCode
  currentStatus?: ChargePointStatus
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>()

const emit = defineEmits<{ close: [] }>()

const statusOptions = computed(() =>
  isOCPP20x(props.ocppVersion)
    ? Object.values(OCPP20ConnectorStatusEnumType)
    : Object.values(OCPP16ChargePointStatus)
)

const errorCodeOptions = Object.values(OCPP16ChargePointErrorCode)

const defaultStatus = isOCPP20x(props.ocppVersion)
  ? OCPP20ConnectorStatusEnumType.AVAILABLE
  : OCPP16ChargePointStatus.AVAILABLE

const selectedStatus = ref<ChargePointStatus>(props.currentStatus ?? defaultStatus)

const selectedErrorCode = ref<OCPP16ChargePointErrorCode>(
  props.currentErrorCode ?? OCPP16ChargePointErrorCode.NO_ERROR
)

const { pending: pendingState, setConnectorStatus } = useConnectorActions({
  connectorId: computed(() => props.connectorId),
  evseId: computed(() => props.evseId),
  hashId: computed(() => props.hashId),
  ocppVersion: computed(() => props.ocppVersion),
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
  const errorCode = isOCPP20x(props.ocppVersion) ? undefined : selectedErrorCode.value
  setConnectorStatus(selectedStatus.value, close, errorCode)
}
</script>
