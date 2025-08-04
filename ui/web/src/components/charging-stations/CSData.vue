<template>
  <tr class="cs-table__row">
    <td class="cs-table__column">
      {{ chargingStation.stationInfo.chargingStationId }}
    </td>
    <td class="cs-table__column cs-table__column-with-actions">
      <div class="column-data">
        <DataBadge
          :appearance="chargingStation.started === true ? 'success' : 'neutral'"
          :is-bold="false"
        >
          {{ chargingStation.started === true ? 'Yes' : 'No' }}
        </DataBadge>
      </div>
      <div class="column-actions">
        <Button
          v-if="chargingStation.started !== true"
          class="inline-action-button"
          title="Start charging station"
          @click="startChargingStation()"
        >
          <span class="flex items-center gap-1">
            <Play :size="12" />
          </span>
        </Button>
        <Button
          v-if="chargingStation.started === true"
          class="inline-action-button"
          title="Stop charging station"
          @click="stopChargingStation()"
        >
          <span class="flex items-center gap-1">
            <Square :size="12" />
          </span>
        </Button>
      </div>
    </td>
    <td class="cs-table__column cs-table__column-with-actions">
      <div class="column-data">
        {{ getSupervisionUrl() }}
      </div>
      <div class="column-actions">
        <ToggleButton
          :id="`${chargingStation.stationInfo.hashId}-set-supervision-url`"
          class="inline-action-button"
          title="Configure supervision URL"
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
          <span class="flex items-center gap-1">
            <Cog :size="12" />
          </span>
        </ToggleButton>
      </div>
    </td>
    <td class="cs-table__column cs-table__column-with-actions">
      <div class="column-data">
        <DataBadge
          :appearance="getWSState() === 'Open' ? 'success' : 'neutral'"
          :is-bold="false"
        >
          {{ getWSState() }}
        </DataBadge>
      </div>
      <div class="column-actions">
        <Button
          v-if="getWSState() !== 'Open'"
          class="inline-action-button"
          title="Connect to charging station"
          @click="openConnection()"
        >
          <span class="flex items-center gap-1">
            <Link :size="12" />
          </span>
        </Button>
        <Button
          v-if="getWSState() === 'Open'"
          class="inline-action-button"
          title="Disconnect from charging station"
          @click="closeConnection()"
        >
          <span class="flex items-center gap-1">
            <Link2Off :size="12" />
          </span>
        </Button>
      </div>
    </td>
    <td class="cs-table__column">
      <DataBadge
        :appearance="chargingStation.bootNotificationResponse?.status === 'Accepted' ? 'success' : 'neutral'"
        :is-bold="false"
      >
        {{ chargingStation.bootNotificationResponse?.status ?? 'None' }}
      </DataBadge>
    </td>
    <td class="cs-table__column">
      <div class="charger-details">
        <div class="detail-item">
          <DataTag>
            {{ chargingStation.stationInfo.templateName }}
          </DataTag>
        </div>
        <div class="detail-item">
          <DataBadge
            appearance="neutral"
            title="Vendor"
          >
            {{ chargingStation.stationInfo.chargePointVendor }}
          </DataBadge>
        </div>
        <div class="detail-item">
          <DataBadge
            appearance="neutral"
            title="Model"
          >
            {{ chargingStation.stationInfo.chargePointModel }}
          </DataBadge>
        </div>
        <div class="detail-item">
          <DataBadge
            appearance="neutral"
            title="Firmware"
          >
            {{ chargingStation.stationInfo.firmwareVersion ?? 'None' }}
          </DataBadge>
        </div>
      </div>
    </td>
    <td class="cs-table__column cs-table__column-with-actions">
      <div class="column-actions">
        <Button
          class="inline-action-button danger"
          appearance="danger"
          title="Delete charging station"
          @click="deleteChargingStation()"
        >
          <span class="flex items-center gap-1">
            <Trash :size="12" />
          </span>
        </Button>
      </div>
    </td>
    <td class="cs-table__connectors-column">
      <table id="connectors-table">
        <caption />
        <thead id="connectors-table__head">
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
              class="connectors-table__column connectors-table__column-with-actions"
              scope="col"
            >
              Transaction
            </th>
            <th
              class="connectors-table__column connectors-table__column-with-actions"
              scope="col"
            >
              ATG Started
            </th>
          </tr>
        </thead>
        <tbody id="connectors-table__body">
          <CSConnector
            v-for="(connector, index) in getConnectorStatuses()"
            :key="index + 1"
            :atg-status="getATGStatus(index + 1)"
            :charging-station-id="chargingStation.stationInfo.chargingStationId"
            :connector="connector"
            :connector-id="index + 1"
            :hash-id="chargingStation.stationInfo.hashId"
            @need-refresh="$emit('need-refresh')"
          />
        </tbody>
      </table>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { Cog, Link, Link2Off, Play, Square, Trash } from 'lucide-vue-next'
import { useToast } from 'vue-toast-notification'

import type { ChargingStationData, ConnectorStatus, Status } from '@/types'

import Button from '@/components/buttons/Button.vue'
import DataBadge from '@/components/buttons/DataBadge.vue'
import DataTag from '@/components/buttons/DataTag.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import CSConnector from '@/components/charging-stations/CSConnector.vue'
import { deleteFromLocalStorage, getLocalStorage, useUIClient } from '@/composables'

const props = defineProps<{
  chargingStation: ChargingStationData
}>()

const $emit = defineEmits(['need-refresh'])

const getConnectorStatuses = (): ConnectorStatus[] => {
  if (Array.isArray(props.chargingStation.evses) && props.chargingStation.evses.length > 0) {
    const connectorStatuses: ConnectorStatus[] = []
    for (const [evseId, evseStatus] of props.chargingStation.evses.entries()) {
      if (evseId > 0 && Array.isArray(evseStatus.connectors) && evseStatus.connectors.length > 0) {
        for (const connectorStatus of evseStatus.connectors) {
          connectorStatuses.push(connectorStatus)
        }
      }
    }
    return connectorStatuses
  }
  return props.chargingStation.connectors?.slice(1)
}
const getATGStatus = (connectorId: number): Status | undefined => {
  return props.chargingStation.automaticTransactionGenerator
    ?.automaticTransactionGeneratorStatuses?.[connectorId - 1]
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
      return 'None'
  }
}

const uiClient = useUIClient()

const $toast = useToast()

const startChargingStation = (): void => {
  uiClient
    .startChargingStation(props.chargingStation.stationInfo.hashId)
    .then(() => {
      return $toast.success('Charging station successfully started')
    })
    .catch((error: Error) => {
      $toast.error('Error at starting charging station')
      console.error('Error at starting charging station:', error)
    })
}
const stopChargingStation = (): void => {
  uiClient
    .stopChargingStation(props.chargingStation.stationInfo.hashId)
    .then(() => {
      return $toast.success('Charging station successfully stopped')
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping charging station')
      console.error('Error at stopping charging station:', error)
    })
}
const openConnection = (): void => {
  uiClient
    .openConnection(props.chargingStation.stationInfo.hashId)
    .then(() => {
      return $toast.success('Connection successfully opened')
    })
    .catch((error: Error) => {
      $toast.error('Error at opening connection')
      console.error('Error at opening connection:', error)
    })
}
const closeConnection = (): void => {
  uiClient
    .closeConnection(props.chargingStation.stationInfo.hashId)
    .then(() => {
      return $toast.success('Connection successfully closed')
    })
    .catch((error: Error) => {
      $toast.error('Error at closing connection')
      console.error('Error at closing connection:', error)
    })
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
      return $toast.success('Charging station successfully deleted')
    })
    .catch((error: Error) => {
      $toast.error('Error at deleting charging station')
      console.error('Error at deleting charging station:', error)
    })
}
</script>

<style>
#connectors-table {
  display: flex;
  flex-direction: column;
  background-color: white;
  overflow: auto hidden;
  border-collapse: collapse;
  empty-cells: show;
}

#connectors-table__body {
  display: flex;
  flex-direction: column;
}

.connectors-table__row {
  border: solid 0.25px black;
  border-top: none;
  border-bottom: none;
}

.connectors-table__column {
  width: calc(100% / 5);
  display: table-cell !important;
  text-align: left;
}

/* Styles for inline actions */
.cs-table__column-with-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.column-data {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.column-actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: start;
}

.inline-action-button {
  font-size: 0.75rem !important;
  padding: 0.25rem 0.5rem !important;
  white-space: nowrap;
}

/* Override flex display for table cells */
.cs-table__column {
  display: table-cell !important;
  text-align: left;
  padding: 8px;
}

/* Charger details styling */
.charger-details {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 0.75rem;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-label {
  font-weight: 500;
  min-width: 75px;
}

.cs-table__column-with-actions {
  display: table-cell !important;
  text-align: left;
  padding: 8px;
}
</style>
