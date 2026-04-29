<template>
  <article
    class="modern-card"
    :aria-label="`Charging station ${chargingStation.stationInfo.chargingStationId}`"
  >
    <header class="modern-card__head">
      <div class="modern-card__head-row">
        <h3 class="modern-card__title">
          {{ chargingStation.stationInfo.chargingStationId }}
        </h3>
        <div class="modern-card__pills">
          <StatePill :variant="startedVariant">
            {{ chargingStation.started === true ? 'started' : 'stopped' }}
          </StatePill>
          <StatePill :variant="wsVariant">
            ws {{ wsLabel }}
          </StatePill>
        </div>
      </div>
      <dl class="modern-card__subtitle">
        <div
          class="modern-card__template-badge"
          :title="chargingStation.stationInfo.templateName"
        >
          <span class="modern-card__template-value">
            {{ chargingStation.stationInfo.templateName }}
          </span>
        </div>
        <div>
          <dt>Vendor</dt>
          <dd>{{ chargingStation.stationInfo.chargePointVendor }}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{{ chargingStation.stationInfo.chargePointModel }}</dd>
        </div>
        <div>
          <dt>OCPP</dt>
          <dd>{{ chargingStation.stationInfo.ocppVersion ?? EMPTY }}</dd>
        </div>
        <div>
          <dt>Firmware</dt>
          <dd>{{ chargingStation.stationInfo.firmwareVersion ?? EMPTY }}</dd>
        </div>
        <div>
          <dt>Registration</dt>
          <dd>{{ chargingStation.bootNotificationResponse?.status ?? EMPTY }}</dd>
        </div>
      </dl>
    </header>
    <div class="modern-card__body">
      <div
        class="modern-card__url-row"
        role="button"
        tabindex="0"
        :title="chargingStation.supervisionUrl"
        aria-label="Edit supervision URL"
        @click="openSupervisionDialog"
        @keydown.enter.prevent="openSupervisionDialog"
        @keydown.space.prevent="openSupervisionDialog"
      >
        <span class="modern-card__url-badge">CSMS</span>
        <p class="modern-card__url">
          {{ supervisionUrl }}
        </p>
        <button
          type="button"
          class="modern-card__url-edit"
          title="Edit supervision URL"
          aria-label="Edit supervision URL"
          @click.stop="openSupervisionDialog"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      </div>
      <p class="modern-card__section-label">
        Connectors
      </p>
      <div
        v-if="connectors.length === 0"
        class="modern-card__empty-connectors"
      >
        No connectors
      </div>
      <div
        v-else
        class="modern-card__connectors"
      >
        <ConnectorRow
          v-for="entry in connectors"
          :key="
            entry.evseId != null
              ? `${entry.evseId}-${entry.connectorId}`
              : String(entry.connectorId)
          "
          :atg-status="getATGStatusForConnector(entry.connectorId)"
          :charging-station-id="chargingStation.stationInfo.chargingStationId"
          :connector="entry.connectorStatus"
          :connector-id="entry.connectorId"
          :evse-id="entry.evseId"
          :hash-id="chargingStation.stationInfo.hashId"
          :ocpp-version="chargingStation.stationInfo.ocppVersion"
          @need-refresh="$emit('need-refresh')"
          @open-start-tx="data => $emit('open-start-tx', data)"
        />
      </div>
    </div>
    <footer class="modern-card__foot">
      <div class="modern-card__foot-group">
        <ActionButton
          :variant="chargingStation.started === true ? 'default' : 'primary'"
          :pending="pending.startStop"
          @click="toggleStation"
        >
          {{ chargingStation.started === true ? 'Stop' : 'Start' }}
        </ActionButton>
        <ActionButton
          :pending="pending.connection"
          @click="toggleConnection"
        >
          {{ wsOpen ? 'Disconnect' : 'Connect' }}
        </ActionButton>
        <ActionButton
          variant="ghost"
          @click="openAuthorizeDialog"
        >
          Authorize
        </ActionButton>
      </div>
      <ActionButton
        variant="danger"
        @click="confirmingDelete = true"
      >
        Delete
      </ActionButton>
    </footer>
    <ConfirmDialog
      v-if="confirmingDelete"
      :title="`Delete ${chargingStation.stationInfo.chargingStationId}?`"
      :message="`This permanently removes the station from the simulator. Active transactions will be lost.`"
      confirm-label="Delete"
      :pending="pending.delete"
      @cancel="confirmingDelete = false"
      @confirm="deleteStation"
    />
  </article>
</template>

<script setup lang="ts">
import {
  type ChargingStationData,
  type ConnectorEntry,
  getWebSocketStateName,
  type OCPPVersion,
  type Status,
  WebSocketReadyState,
} from 'ui-common'
import { computed, ref } from 'vue'

import {
  deleteLocalStorageByKeyPattern,
  EMPTY_VALUE_PLACEHOLDER as EMPTY,
  useUIClient,
} from '@/composables'
import { getATGStatus, getConnectorEntries } from '@/shared/composables/stationStatus.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'
import { formatSupervisionUrl } from '@/shared/utils/formatSupervisionUrl.js'

import ActionButton from './ActionButton.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectorRow from './ConnectorRow.vue'
import StatePill from './StatePill.vue'

const props = defineProps<{
  chargingStation: ChargingStationData
}>()

const emit = defineEmits<{
  'need-refresh': []
  'open-authorize': [data: { chargingStationId: string; hashId: string }]
  'open-set-url': [data: { chargingStationId: string; hashId: string }]
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

const $uiClient = useUIClient()

const confirmingDelete = ref(false)
const { pending, run } = useAsyncAction(
  { connection: false, delete: false, startStop: false },
  () => emit('need-refresh')
)

const wsOpen = computed(() => props.chargingStation.wsState === WebSocketReadyState.OPEN)

const startedVariant = computed<'err' | 'ok'>(() =>
  props.chargingStation.started === true ? 'ok' : 'err'
)

const wsVariant = computed<'err' | 'idle' | 'ok' | 'warn'>(() => {
  switch (props.chargingStation.wsState) {
    case WebSocketReadyState.CLOSED:
      return 'err'
    case WebSocketReadyState.CLOSING:
      return 'warn'
    case WebSocketReadyState.CONNECTING:
      return 'warn'
    case WebSocketReadyState.OPEN:
      return 'ok'
    default:
      return 'idle'
  }
})

const wsLabel = computed(() => {
  const name = getWebSocketStateName(props.chargingStation.wsState)
  return name?.toLowerCase() ?? 'unknown'
})

const supervisionUrl = computed(() => formatSupervisionUrl(props.chargingStation.supervisionUrl))

const connectors = computed<ConnectorEntry[]>(() => getConnectorEntries(props.chargingStation))

const getATGStatusForConnector = (connectorId: number): Status | undefined =>
  getATGStatus(props.chargingStation, connectorId)

const toggleStation = (): void => {
  const hashId = props.chargingStation.stationInfo.hashId
  if (props.chargingStation.started === true) {
    run(
      'startStop',
      () => $uiClient.stopChargingStation(hashId),
      'Charging station stopped',
      'Error stopping charging station'
    )
  } else {
    run(
      'startStop',
      () => $uiClient.startChargingStation(hashId),
      'Charging station started',
      'Error starting charging station'
    )
  }
}

const toggleConnection = (): void => {
  const hashId = props.chargingStation.stationInfo.hashId
  if (wsOpen.value) {
    run(
      'connection',
      () => $uiClient.closeConnection(hashId),
      'Connection closed',
      'Error closing connection'
    )
  } else {
    run(
      'connection',
      () => $uiClient.openConnection(hashId),
      'Connection opened',
      'Error opening connection'
    )
  }
}

const openSupervisionDialog = (): void => {
  emit('open-set-url', {
    chargingStationId: props.chargingStation.stationInfo.chargingStationId,
    hashId: props.chargingStation.stationInfo.hashId,
  })
}

const openAuthorizeDialog = (): void => {
  emit('open-authorize', {
    chargingStationId: props.chargingStation.stationInfo.chargingStationId,
    hashId: props.chargingStation.stationInfo.hashId,
  })
}

const deleteStation = (): void => {
  const hashId = props.chargingStation.stationInfo.hashId
  run(
    'delete',
    () => $uiClient.deleteChargingStation(hashId),
    'Charging station deleted',
    'Error deleting charging station',
    () => {
      deleteLocalStorageByKeyPattern(hashId)
      confirmingDelete.value = false
    }
  )
}
</script>
