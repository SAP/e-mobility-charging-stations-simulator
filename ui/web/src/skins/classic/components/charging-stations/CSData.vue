<template>
  <tr>
    <td>
      {{ chargingStation.stationInfo.chargingStationId }}
    </td>
    <td>
      {{ chargingStation.started === true ? 'Yes' : 'No' }}
    </td>
    <td>
      {{ supervisionUrl }}
    </td>
    <td>
      {{ getWebSocketStateName(chargingStation.wsState) ?? EMPTY_VALUE_PLACEHOLDER }}
    </td>
    <td>
      {{ chargingStation.bootNotificationResponse?.status ?? EMPTY_VALUE_PLACEHOLDER }}
    </td>
    <td>
      {{ chargingStation.stationInfo.ocppVersion ?? EMPTY_VALUE_PLACEHOLDER }}
    </td>
    <td>
      {{ chargingStation.stationInfo.templateName }}
    </td>
    <td>
      {{ chargingStation.stationInfo.chargePointVendor }}
    </td>
    <td>
      {{ chargingStation.stationInfo.chargePointModel }}
    </td>
    <td>
      {{ chargingStation.stationInfo.firmwareVersion ?? EMPTY_VALUE_PLACEHOLDER }}
    </td>
    <td>
      <StateButton
        :active="chargingStation.started === true"
        :off="() => stopChargingStation()"
        off-label="Stop Charging Station"
        :on="() => startChargingStation()"
        on-label="Start Charging Station"
      />
      <StateButton
        :active="isWebSocketOpen"
        :off="() => closeConnection()"
        off-label="Close Connection"
        :on="() => openConnection()"
        on-label="Open Connection"
      />
      <ToggleButton
        :id="`${chargingStation.stationInfo.hashId}-set-supervision-url`"
        :off="
          () => {
            $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
          }
        "
        :on="
          () => {
            $router.push({
              name: ROUTE_NAMES.SET_SUPERVISION_URL,
              params: {
                hashId: chargingStation.stationInfo.hashId,
                chargingStationId: chargingStation.stationInfo.chargingStationId,
              },
            })
          }
        "
        :shared="true"
        @clicked="$emit('need-refresh')"
      >
        Set Supervision Url
      </ToggleButton>
      <Button @click="deleteChargingStation()">
        Delete Charging Station
      </Button>
    </td>
    <td class="cs-data__connectors-cell">
      <table class="data-table">
        <thead class="data-table__head">
          <tr>
            <th scope="col">
              Identifier
            </th>
            <th scope="col">
              Status
            </th>
            <th scope="col">
              Locked
            </th>
            <th scope="col">
              Transaction
            </th>
            <th scope="col">
              ATG Started
            </th>
            <th scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <CSConnector
            v-for="entry in connectorEntries"
            :key="entry.evseId != null ? `${entry.evseId}-${entry.connectorId}` : entry.connectorId"
            :atg-status="getATGStatusForConnector(entry.connectorId)"
            :charging-station-id="chargingStation.stationInfo.chargingStationId"
            :connector="entry.connectorStatus"
            :connector-id="entry.connectorId"
            :evse-id="entry.evseId"
            :hash-id="chargingStation.stationInfo.hashId"
            :ocpp-version="chargingStation.stationInfo.ocppVersion"
            @need-refresh="$emit('need-refresh')"
          />
        </tbody>
      </table>
    </td>
  </tr>
</template>

<script setup lang="ts">
import {
  type ChargingStationData,
  type ConnectorEntry,
  getWebSocketStateName,
  type Status,
  WebSocketReadyState,
} from 'ui-common'
import { computed } from 'vue'

import {
  deleteLocalStorageByKeyPattern,
  EMPTY_VALUE_PLACEHOLDER,
  ROUTE_NAMES,
  useUIClient,
} from '@/composables'
import { getATGStatus, getConnectorEntries } from '@/shared/composables/stationStatus.js'
import { useAsyncAction } from '@/shared/composables/useAsyncAction.js'
import { formatSupervisionUrl } from '@/shared/utils/formatSupervisionUrl.js'

import Button from '../buttons/Button.vue'
import StateButton from '../buttons/StateButton.vue'
import ToggleButton from '../buttons/ToggleButton.vue'
import CSConnector from './CSConnector.vue'

const props = defineProps<{
  chargingStation: ChargingStationData
}>()

const emit = defineEmits<{ 'need-refresh': [] }>()

const isWebSocketOpen = computed(() => props.chargingStation.wsState === WebSocketReadyState.OPEN)

const connectorEntries = computed((): ConnectorEntry[] =>
  getConnectorEntries(props.chargingStation)
)
const getATGStatusForConnector = (connectorId: number): Status | undefined =>
  getATGStatus(props.chargingStation, connectorId)
const supervisionUrl = computed((): string =>
  formatSupervisionUrl(props.chargingStation.supervisionUrl, { wordBreak: true })
)

const $uiClient = useUIClient()

const { run } = useAsyncAction({ connection: false, delete: false, startStop: false }, () =>
  emit('need-refresh')
)

const startChargingStation = (): void => {
  run(
    'startStop',
    () => $uiClient.startChargingStation(props.chargingStation.stationInfo.hashId),
    'Charging station successfully started',
    'Error at starting charging station'
  )
}
const stopChargingStation = (): void => {
  run(
    'startStop',
    () => $uiClient.stopChargingStation(props.chargingStation.stationInfo.hashId),
    'Charging station successfully stopped',
    'Error at stopping charging station'
  )
}
const openConnection = (): void => {
  run(
    'connection',
    () => $uiClient.openConnection(props.chargingStation.stationInfo.hashId),
    'Connection successfully opened',
    'Error at opening connection'
  )
}
const closeConnection = (): void => {
  run(
    'connection',
    () => $uiClient.closeConnection(props.chargingStation.stationInfo.hashId),
    'Connection successfully closed',
    'Error at closing connection'
  )
}
const deleteChargingStation = (): void => {
  run(
    'delete',
    () => $uiClient.deleteChargingStation(props.chargingStation.stationInfo.hashId),
    'Charging station successfully deleted',
    'Error at deleting charging station',
    () => {
      deleteLocalStorageByKeyPattern(props.chargingStation.stationInfo.hashId)
    }
  )
}
</script>

<style scoped>
.cs-data__connectors-cell {
  vertical-align: top;
  padding: 0;
}
</style>
