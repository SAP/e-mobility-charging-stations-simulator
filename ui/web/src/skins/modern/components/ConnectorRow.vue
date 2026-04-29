<template>
  <div
    :class="[
      'modern-connector',
      { 'modern-connector--active': connector.transactionStarted === true },
    ]"
  >
    <div class="modern-connector__gutter">
      <span class="modern-connector__id">
        {{ identifier }}
      </span>
      <button
        type="button"
        :class="['modern-connector__lock', { 'modern-connector__lock--on': effectiveLocked }]"
        :disabled="pending.lock || connector.transactionStarted === true"
        :title="lockTitle"
        :aria-label="lockTitle"
        :aria-pressed="effectiveLocked"
        @click="toggleLock"
      >
        <svg
          class="modern-connector__lock-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect
            x="3"
            y="11"
            width="18"
            height="11"
            rx="2"
          />
          <path
            v-if="effectiveLocked"
            d="M7 11V7a5 5 0 0 1 10 0v4"
          />
          <path
            v-else
            d="M7 11V7a5 5 0 0 1 9.9-1"
          />
        </svg>
      </button>
    </div>
    <div class="modern-connector__content">
      <div class="modern-connector__meta">
        <StatePill :variant="statusVariant">
          {{ connector.status ?? 'unknown' }}
        </StatePill>
        <StatePill
          v-if="connector.locked === true"
          variant="warn"
        >
          locked
        </StatePill>
        <StatePill
          v-if="atgStatus?.start === true"
          variant="ok"
        >
          ATG running
        </StatePill>
      </div>
      <div
        v-if="connector.transactionStarted === true"
        class="modern-connector__tx"
      >
        <span
          class="modern-connector__tx-dot"
          aria-hidden="true"
        />
        <table class="modern-connector__tx-table">
          <tbody>
            <tr>
              <th scope="row">
                Tx
              </th>
              <td>#{{ connector.transactionId }}</td>
            </tr>
            <tr>
              <th scope="row">
                Energy
              </th>
              <td>{{ txEnergy }}</td>
            </tr>
            <tr v-if="connector.transactionIdTag != null">
              <th scope="row">
                Tag
              </th>
              <td>{{ connector.transactionIdTag }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="modern-connector__actions">
        <button
          v-if="connector.transactionStarted !== true"
          type="button"
          class="modern-icon-btn modern-icon-btn--primary modern-icon-btn--lg"
          title="Start transaction"
          aria-label="Start transaction"
          @click="openStartTransaction"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          v-else
          type="button"
          class="modern-icon-btn modern-icon-btn--danger modern-icon-btn--lg"
          :disabled="pending.stopTx"
          title="Stop transaction"
          aria-label="Stop transaction"
          @click="stopTransaction"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
          >
            <rect
              x="6"
              y="6"
              width="12"
              height="12"
              rx="1.5"
            />
          </svg>
        </button>
        <ActionButton
          variant="chip"
          :pending="pending.atg"
          @click="toggleAtg"
        >
          {{ atgStatus?.start === true ? 'Stop ATG' : 'Start ATG' }}
        </ActionButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConnectorStatus, OCPPVersion, Status } from 'ui-common'

import { computed } from 'vue'

import { useConnectorActions } from '@/shared/composables/useConnectorActions.js'
import { getConnectorStatusVariant } from '@/shared/utils/stationStatus.js'

import ActionButton from './ActionButton.vue'
import StatePill from './StatePill.vue'

const props = defineProps<{
  atgStatus?: Status
  chargingStationId: string
  connector: ConnectorStatus
  connectorId: number
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>()

const emit = defineEmits<{
  'need-refresh': []
  'open-start-tx': [
    data: {
      chargingStationId: string
      connectorId: string
      evseId?: number
      hashId: string
      ocppVersion?: OCPPVersion
    }
  ]
}>()

const {
  lockConnector,
  pending,
  startATG,
  stopATG,
  stopTransaction: doStopTransaction,
  unlockConnector,
} = useConnectorActions({
  connectorId: computed(() => props.connectorId),
  hashId: computed(() => props.hashId),
  onRefresh: () => emit('need-refresh'),
})

const identifier = computed(() =>
  props.evseId != null ? `${props.evseId}/${props.connectorId}` : String(props.connectorId)
)

const statusVariant = computed(() => getConnectorStatusVariant(props.connector.status))

// The connector is effectively locked whenever it's explicitly locked
// OR a transaction is active (physical lock engages during charging).
const effectiveLocked = computed(
  () => props.connector.locked === true || props.connector.transactionStarted === true
)

const lockTitle = computed(() => {
  if (props.connector.transactionStarted === true) return 'Locked during transaction'
  return props.connector.locked === true ? 'Unlock connector' : 'Lock connector'
})

const txEnergy = computed(() => {
  const wh = props.connector.transactionEnergyActiveImportRegisterValue
  if (wh == null) return '—'
  if (wh >= 1000) return `${(wh / 1000).toFixed(2)} kWh`
  return `${Math.round(wh)} Wh`
})

const toggleLock = (): void => {
  if (props.connector.locked === true) {
    unlockConnector()
  } else {
    lockConnector()
  }
}

const toggleAtg = (): void => {
  if (props.atgStatus?.start === true) {
    stopATG()
  } else {
    startATG()
  }
}

const stopTransaction = (): void => {
  doStopTransaction(props.connector.transactionId, props.ocppVersion)
}

const openStartTransaction = (): void => {
  emit('open-start-tx', {
    chargingStationId: props.chargingStationId,
    connectorId: String(props.connectorId),
    evseId: props.evseId,
    hashId: props.hashId,
    ocppVersion: props.ocppVersion,
  })
}
</script>
