<template>
  <tr class="cs-table__row">
    <td class="cs-table__column">
      {{ props.chargingStation.stationInfo.chargingStationId ?? 'Ø' }}
    </td>
    <td class="cs-table__column">{{ props.chargingStation.started === true ? 'Yes' : 'No' }}</td>
    <td class="cs-table__column">
      {{ getSupervisionUrl() }}
    </td>
    <td class="cs-table__column">{{ getWsState() }}</td>
    <td class="cs-table__column">
      {{ props.chargingStation?.bootNotificationResponse?.status ?? 'Ø' }}
    </td>
    <td class="cs-table__column">
      {{ props.chargingStation.stationInfo.templateName }}
    </td>
    <td class="cs-table__column">{{ props.chargingStation.stationInfo.chargePointVendor }}</td>
    <td class="cs-table__column">{{ props.chargingStation.stationInfo.chargePointModel }}</td>
    <td class="cs-table__column">
      {{ props.chargingStation.stationInfo.firmwareVersion ?? 'Ø' }}
    </td>
    <td class="cs-table__column">
      <Button @click="startChargingStation()">Start Charging Station</Button>
      <Button @click="stopChargingStation()">Stop Charging Station</Button>
      <Button @click="openConnection()">Open Connection</Button>
      <Button @click="closeConnection()">Close Connection</Button>
      <Button @click="deleteChargingStation()">Delete Charging Station</Button>
    </td>
    <td class="cs-table__connectors-column">
      <table id="connectors-table">
        <thead id="connectors-table__head">
          <tr class="connectors-table__row">
            <th scope="col" class="connectors-table__column">Identifier</th>
            <th scope="col" class="connectors-table__column">Status</th>
            <th scope="col" class="connectors-table__column">Transaction</th>
            <th scope="col" class="connectors-table__column">ATG Started</th>
            <th scope="col" class="connectors-table__column">Actions</th>
          </tr>
        </thead>
        <tbody id="connectors-table__body">
          <!-- eslint-disable-next-line vue/valid-v-for -->
          <CSConnector
            v-for="(connector, index) in getConnectors()"
            :hash-id="props.chargingStation.stationInfo.hashId"
            :connector-id="index + 1"
            :connector="connector"
            :atg-status="getATGStatus(index + 1)"
            :transaction-id="connector.transactionId"
            :id-tag="props.idTag"
          />
        </tbody>
      </table>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import CSConnector from '@/components/charging-stations/CSConnector.vue'
import type { ChargingStationData, ConnectorStatus, Status } from '@/types'

const props = defineProps<{
  chargingStation: ChargingStationData
  idTag: string
}>()

function getConnectors(): ConnectorStatus[] {
  if (Array.isArray(props.chargingStation.evses) && props.chargingStation.evses.length > 0) {
    const connectorsStatus: ConnectorStatus[] = []
    for (const [evseId, evseStatus] of props.chargingStation.evses.entries()) {
      if (evseId > 0 && Array.isArray(evseStatus.connectors) && evseStatus.connectors.length > 0) {
        for (const connectorStatus of evseStatus.connectors) {
          connectorsStatus.push(connectorStatus)
        }
      }
    }
    return connectorsStatus
  }
  return props.chargingStation.connectors?.slice(1)
}
function getATGStatus(connectorId: number): Status | undefined {
  return props.chargingStation.automaticTransactionGenerator
    ?.automaticTransactionGeneratorStatuses?.[connectorId - 1]
}
function getSupervisionUrl(): string {
  const supervisionUrl = new URL(props.chargingStation.supervisionUrl)
  return `${supervisionUrl.protocol}//${supervisionUrl.host.split('.').join('.\u200b')}`
}
function getWsState(): string {
  switch (props.chargingStation?.wsState) {
    case WebSocket.CONNECTING:
      return 'Connecting'
    case WebSocket.OPEN:
      return 'Open'
    case WebSocket.CLOSING:
      return 'Closing'
    case WebSocket.CLOSED:
      return 'Closed'
    default:
      return 'Ø'
  }
}

const UIClient = getCurrentInstance()?.appContext.config.globalProperties.$UIClient

function startChargingStation(): void {
  UIClient.startChargingStation(props.chargingStation.stationInfo.hashId)
}
function stopChargingStation(): void {
  UIClient.stopChargingStation(props.chargingStation.stationInfo.hashId)
}
function openConnection(): void {
  UIClient.openConnection(props.chargingStation.stationInfo.hashId)
}
function closeConnection(): void {
  UIClient.closeConnection(props.chargingStation.stationInfo.hashId)
}
function deleteChargingStation(): void {
  UIClient.deleteChargingStation(props.chargingStation.stationInfo.hashId)
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
}

.connectors-table__row:nth-of-type(even) {
  background-color: whitesmoke;
}

#connectors-table__head .connectors-table__row {
  background-color: lightgrey;
}

.connectors-table__column {
  width: calc(100% / 5);
  text-align: center;
}
</style>
