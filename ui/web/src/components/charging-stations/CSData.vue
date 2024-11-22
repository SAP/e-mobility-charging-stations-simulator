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
      <Button @click="startChargingStation()">
        Start Charging Station
      </Button>
      <Button @click="stopChargingStation()">
        Stop Charging Station
      </Button>
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
        @clicked="
          () => {
            $emit('need-refresh')
          }
        "
      >
        Set Supervision Url
      </ToggleButton>
      <Button @click="openConnection()">
        Open Connection
      </Button>
      <Button @click="closeConnection()">
        Close Connection
      </Button>
      <Button @click="deleteChargingStation()">
        Delete Charging Station
      </Button>
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
import type { ChargingStationData, ConnectorStatus, Status } from '@/types'

import Button from '@/components/buttons/Button.vue'
import ToggleButton from '@/components/buttons/ToggleButton.vue'
import CSConnector from '@/components/charging-stations/CSConnector.vue'
import { deleteFromLocalStorage, getLocalStorage, useUIClient } from '@/composables'
import { useToast } from 'vue-toast-notification'

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
      return 'Ø'
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
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border: solid 0.25px black;
}

.connectors-table__row:nth-of-type(even) {
  background-color: whitesmoke;
}

#connectors-table__head .connectors-table__row {
  background-color: lightgrey;
}

.connectors-table__column {
  width: calc(100% / 5);
  display: flex;
  flex-direction: column;
  text-align: center;
}
</style>
