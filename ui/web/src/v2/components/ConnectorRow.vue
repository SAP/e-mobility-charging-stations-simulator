<template>
  <div :class="['v2-connector', { 'v2-connector--active': connector.transactionStarted === true }]">
    <div class="v2-connector__gutter">
      <span class="v2-connector__id">
        {{ identifier }}
      </span>
      <button
        type="button"
        :class="['v2-connector__lock', { 'v2-connector__lock--on': effectiveLocked }]"
        :disabled="pending.lock || connector.transactionStarted === true"
        :title="lockTitle"
        :aria-label="lockTitle"
        :aria-pressed="effectiveLocked"
        @click="toggleLock"
      >
        <svg
          v-if="effectiveLocked"
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
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <svg
          v-else
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
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </svg>
      </button>
    </div>
    <div class="v2-connector__content">
      <div class="v2-connector__meta">
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
        class="v2-connector__tx"
      >
        <span
          class="v2-connector__tx-dot"
          aria-hidden="true"
        />
        <table class="v2-connector__tx-table">
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
      <div class="v2-connector__actions">
        <button
          v-if="connector.transactionStarted !== true"
          type="button"
          class="v2-icon-btn v2-icon-btn--primary v2-icon-btn--lg"
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
          class="v2-icon-btn v2-icon-btn--danger v2-icon-btn--lg"
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

import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/composables'

import { V2_ROUTE_NAMES } from '../composables/v2Constants'
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
}>()

const $uiClient = useUIClient()
const $router = useRouter()
const $toast = useToast()

const pending = reactive({
  atg: false,
  lock: false,
  stopTx: false,
})

const identifier = computed(() =>
  props.evseId != null ? `${props.evseId}/${props.connectorId}` : String(props.connectorId)
)

const statusVariant = computed<'err' | 'idle' | 'ok' | 'warn'>(() => {
  const status = props.connector.status?.toLowerCase() ?? ''
  if (status === 'available') return 'ok'
  if (status === 'charging' || status === 'occupied' || status === 'preparing') return 'warn'
  if (status === 'faulted' || status === 'unavailable') return 'err'
  return 'idle'
})

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

const run = (
  key: keyof typeof pending,
  action: Promise<unknown>,
  successMsg: string,
  errorMsg: string
): void => {
  if (pending[key]) return
  pending[key] = true
  action
    .then(() => {
      $toast.success(successMsg)
      emit('need-refresh')
      return undefined
    })
    .finally(() => {
      pending[key] = false
    })
    .catch((error: unknown) => {
      console.error(`${errorMsg}:`, error)
      $toast.error(errorMsg)
    })
}

const toggleLock = (): void => {
  if (props.connector.locked === true) {
    run(
      'lock',
      $uiClient.unlockConnector(props.hashId, props.connectorId),
      'Connector unlocked',
      'Error unlocking connector'
    )
  } else {
    run(
      'lock',
      $uiClient.lockConnector(props.hashId, props.connectorId),
      'Connector locked',
      'Error locking connector'
    )
  }
}

const toggleAtg = (): void => {
  if (props.atgStatus?.start === true) {
    run(
      'atg',
      $uiClient.stopAutomaticTransactionGenerator(props.hashId, props.connectorId),
      'ATG stopped',
      'Error stopping ATG'
    )
  } else {
    run(
      'atg',
      $uiClient.startAutomaticTransactionGenerator(props.hashId, props.connectorId),
      'ATG started',
      'Error starting ATG'
    )
  }
}

const stopTransaction = (): void => {
  if (props.connector.transactionId == null) {
    $toast.error('No transaction to stop')
    return
  }
  run(
    'stopTx',
    $uiClient.stopTransaction(props.hashId, {
      ocppVersion: props.ocppVersion,
      transactionId: props.connector.transactionId,
    }),
    'Transaction stopped',
    'Error stopping transaction'
  )
}

const openStartTransaction = (): void => {
  $router
    .push({
      name: V2_ROUTE_NAMES.V2_START_TRANSACTION,
      params: {
        chargingStationId: props.chargingStationId,
        connectorId: String(props.connectorId),
        hashId: props.hashId,
      },
      query: {
        ...(props.evseId != null ? { evseId: String(props.evseId) } : {}),
        ...(props.ocppVersion != null ? { ocppVersion: props.ocppVersion } : {}),
      },
    })
    .catch((error: unknown) => {
      console.error('Navigation failed:', error)
    })
}
</script>
