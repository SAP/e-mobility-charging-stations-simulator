<template>
  <tr class="cs-table__row">
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.chargingStationId }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.started === true ? 'Yes' : 'No' }}
    </td>
    <td class="cs-table__column">
      {{ getSupervisionUrl() }}
    </td>
    <td class="cs-table__column">
      {{ getWSState() }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.bootNotificationResponse?.status ?? 'Ø' }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.ocppVersion ?? 'Ø' }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.templateName }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.chargePointVendor }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.chargePointModel }}
    </td>
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.firmwareVersion ?? 'Ø' }}
    </td>
    <td class="cs-table__column">
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
            $router.push({ name: 'charging-stations' })
          }
        "
        :on="
          () => {
            $router.push({
              name: 'set-supervision-url',
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
    <td class="cs-table__connectors-column">
      <table class="connectors-table">
        <thead class="connectors-table__head">
          <tr class="connectors-table__row">
            <th
              class="connectors-table__column"
              scope="col"
            >
              Identifier
            </th>
            <th
              class="connectors-table__column"
              scope="col"
            >
              Status
            </th>
            <th
              class="connectors-table__column"
              scope="col"
            >
              Locked
            </th>
            <th
              class="connectors-table__column"
              scope="col"
            >
              Transaction
            </th>
            <th
              class="connectors-table__column"
              scope="col"
            >
              ATG Started
            </th>
            <th
              class="connectors-table__column"
              scope="col"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="connectors-table__body">
          <CSConnector
            v-for="entry in getConnectorEntries()"
            :key="entry.evseId != null ? `${entry.evseId}-${entry.connectorId}` : entry.connectorId"
            :atg-status="getATGStatus(entry.connectorId)"
            :charging-station-id="chargingStation.stationInfo.chargingStationId"
            :connector="entry.connector"
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
import { computed } from 'vue'
import { useToast } from 'vue-toast-notification'

import type { ChargingStationData, ConnectorStatus, Status } from '@/types'

import Button from '@/components/buttons/Button.vue'
import StateButton from '@/components/buttons/StateButton.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import CSConnector from '@/components/charging-stations/CSConnector.vue'
import { deleteFromLocalStorage, getLocalStorage, useUIClient } from '@/composables'

interface ConnectorTableEntry {
  connector: ConnectorStatus
  connectorId: number
  evseId?: number
}

const props = defineProps<{
  chargingStation: ChargingStationData
}>()

const $emit = defineEmits(['need-refresh'])

const isWebSocketOpen = computed(() => props.chargingStation.wsState === WebSocket.OPEN)

const getConnectorEntries = (): ConnectorTableEntry[] => {
  if (Array.isArray(props.chargingStation.evses) && props.chargingStation.evses.length > 0) {
    const entries: ConnectorTableEntry[] = []
    for (const evse of props.chargingStation.evses) {
      if (evse.evseId > 0) {
        for (const entry of evse.connectors) {
          if (entry.connectorId > 0) {
            entries.push({
              connector: entry.connector,
              connectorId: entry.connectorId,
              evseId: evse.evseId,
            })
          }
        }
      }
    }
    return entries
  }
  return (props.chargingStation.connectors ?? [])
    .filter(c => c.connectorId > 0)
    .map(entry => ({
      connector: entry.connector,
      connectorId: entry.connectorId,
    }))
}
const getATGStatus = (connectorId: number): Status | undefined => {
  return props.chargingStation.automaticTransactionGenerator?.automaticTransactionGeneratorStatuses?.find(
    entry => entry.connectorId === connectorId
  )?.status
}
const getSupervisionUrl = (): string => {
  const supervisionUrl = new URL(props.chargingStation.supervisionUrl)
  return `${supervisionUrl.protocol}//${supervisionUrl.host.split('.').join('.\u200b')}`
}
const getWSState = (): string => {
  switch (props.chargingStation?.wsState) {
    case WebSocket.CLOSED:
      return 'Closed'
    case WebSocket.CLOSING:
      return 'Closing'
    case WebSocket.CONNECTING:
      return 'Connecting'
    case WebSocket.OPEN:
      return 'Open'
    default:
      return 'Ø'
  }
}

const uiClient = useUIClient()

const $toast = useToast()

const executeAction = (action: Promise<unknown>, successMsg: string, errorMsg: string): void => {
  action
    .then(() => {
      $emit('need-refresh')
      return $toast.success(successMsg)
    })
    .catch((error: Error) => {
      $toast.error(errorMsg)
      console.error(`${errorMsg}:`, error)
    })
}

const startChargingStation = (): void => {
  executeAction(
    uiClient.startChargingStation(props.chargingStation.stationInfo.hashId),
    'Charging station successfully started',
    'Error at starting charging station'
  )
}
const stopChargingStation = (): void => {
  executeAction(
    uiClient.stopChargingStation(props.chargingStation.stationInfo.hashId),
    'Charging station successfully stopped',
    'Error at stopping charging station'
  )
}
const openConnection = (): void => {
  executeAction(
    uiClient.openConnection(props.chargingStation.stationInfo.hashId),
    'Connection successfully opened',
    'Error at opening connection'
  )
}
const closeConnection = (): void => {
  executeAction(
    uiClient.closeConnection(props.chargingStation.stationInfo.hashId),
    'Connection successfully closed',
    'Error at closing connection'
  )
}
const deleteChargingStation = (): void => {
  uiClient
    .deleteChargingStation(props.chargingStation.stationInfo.hashId)
    .then(() => {
      for (const key in getLocalStorage()) {
        if (key.includes(props.chargingStation.stationInfo.hashId)) {
          deleteFromLocalStorage(key)
        }
      }
      $emit('need-refresh')
      return $toast.success('Charging station successfully deleted')
    })
    .catch((error: Error) => {
      $toast.error('Error at deleting charging station')
      console.error('Error at deleting charging station:', error)
    })
}
</script>

<style scoped>
.connectors-table {
  width: 100%;
  table-layout: fixed;
  background-color: var(--color-bg-surface);
  border-collapse: collapse;
  empty-cells: show;
}

.connectors-table__head .connectors-table__row {
  background-color: var(--color-bg-header);
}

:deep(.connectors-table__row) {
  border: solid 0.25px var(--color-border-row);
}

:deep(.connectors-table__row:nth-of-type(even)) {
  background-color: var(--color-bg-hover);
}

:deep(.connectors-table__column) {
  text-align: center;
  vertical-align: middle;
  padding: 0.25rem;
}
</style>
