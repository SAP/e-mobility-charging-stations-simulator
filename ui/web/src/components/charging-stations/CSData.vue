<template>
  <tr v-for="(connector, index) in getConnectors()" class="cs-table__row">
    <CSConnector
      :hash-id="getHashId()"
      :connector="connector"
      :connector-id="index + 1"
      :transaction-id="connector.transactionId"
      :id-tag="props.idTag"
    />
    <td class="cs-table__column">{{ getId() }}</td>
    <td class="cs-table__column">{{ getStarted() }}</td>
    <td class="cs-table__column">{{ getSupervisionUrl() }}</td>
    <td class="cs-table__column">{{ getWsState() }}</td>
    <td class="cs-table__column">{{ getRegistrationStatus() }}</td>
    <td class="cs-table__column">{{ getInfo().templateName }}</td>
    <td class="cs-table__column">{{ getVendor() }}</td>
    <td class="cs-table__column">{{ getModel() }}</td>
    <td class="cs-table__column">{{ getFirmwareVersion() }}</td>
  </tr>
</template>

<script setup lang="ts">
// import { reactive } from 'vue'
import CSConnector from './CSConnector.vue'
import type { ChargingStationData, ChargingStationInfo, ConnectorStatus } from '@/types'

const props = defineProps<{
  chargingStation: ChargingStationData
  idTag: string
}>()

// type State = {
//   isTagModalVisible: boolean
//   idTag: string
// }

// const state: State = reactive({
//   isTagModalVisible: false,
//   idTag: ''
// })

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
function getInfo(): ChargingStationInfo {
  return props.chargingStation.stationInfo
}
function getHashId(): string {
  return getInfo().hashId
}
function getId(): string {
  return getInfo().chargingStationId ?? 'Ø'
}
function getModel(): string {
  return getInfo().chargePointModel
}
function getVendor(): string {
  return getInfo().chargePointVendor
}
function getFirmwareVersion(): string {
  return getInfo().firmwareVersion ?? 'Ø'
}
function getStarted(): string {
  return props.chargingStation.started === true ? 'Yes' : 'No'
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
function getRegistrationStatus(): string {
  return props.chargingStation?.bootNotificationResponse?.status ?? 'Ø'
}
// function showTagModal(): void {
//   state.isTagModalVisible = true
// }
// function hideTagModal(): void {
//   state.isTagModalVisible = false
// }
</script>
