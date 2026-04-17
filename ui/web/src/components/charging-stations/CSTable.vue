<template>
  <div class="cs-table__wrapper">
    <table class="data-table data-table--bordered">
      <caption class="data-table__caption">
        Charging Stations
      </caption>
      <colgroup>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col class="cs-table__col--connectors">
      </colgroup>
      <thead class="data-table__head">
        <tr>
          <th scope="col">
            Name
          </th>
          <th scope="col">
            Started
          </th>
          <th scope="col">
            Supervision Url
          </th>
          <th scope="col">
            WebSocket State
          </th>
          <th scope="col">
            Registration Status
          </th>
          <th scope="col">
            OCPP Version
          </th>
          <th scope="col">
            Template
          </th>
          <th scope="col">
            Vendor
          </th>
          <th scope="col">
            Model
          </th>
          <th scope="col">
            Firmware
          </th>
          <th scope="col">
            Actions
          </th>
          <th
            class="cs-table__connectors-column"
            scope="col"
          >
            Connector(s)
          </th>
        </tr>
      </thead>
      <tbody>
        <CSData
          v-for="chargingStation in chargingStations"
          :key="chargingStation.stationInfo.hashId"
          :charging-station="chargingStation"
          @need-refresh="$emit('need-refresh')"
        />
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { ChargingStationData } from 'ui-common'

import CSData from '@/components/charging-stations/CSData.vue'

defineProps<{
  chargingStations: ChargingStationData[]
}>()

const $emit = defineEmits(['need-refresh'])
</script>

<style scoped>
.cs-table__wrapper {
  overflow-x: auto;
}

.cs-table__col--connectors {
  width: 33%;
}

.cs-table__connectors-column {
  vertical-align: top;
  padding: 0;
}
</style>
