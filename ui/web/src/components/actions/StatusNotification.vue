<template>
  <h1>Status Notification</h1>
  <h2>{{ chargingStationId }}</h2>
  <h3>Connector {{ connectorId }}</h3>

  <p>
    New Status:
    <select v-model="state.status">
      <option value="Available">
        Available
      </option>
      <option value="Preparing">
        Preparing
      </option>
      <option value="Charging">
        Charging
      </option>
      <option value="SuspendedEV">
        Suspended EV
      </option>
      <option value="SuspendedEVSE">
        Suspended EVSE
      </option>
      <option value="Finishing">
        Finishing
      </option>
      <option value="Reserved">
        Reserved
      </option>
      <option value="Unavailable">
        Unavailable
      </option>
    </select>
  </p>

  <Button
    id="action-button"
    @click="() => {
      console.log('Sending Status Notification:', hashId, connectorId, state.status);
      $uiClient.sendStatusNotification(
        hashId,
        convertToInt(connectorId),
        state.status,
        'NoError'
      )
        .then(() => {
          $toast.success('Status Notification successfully sent')
        })
        .catch((error: Error) => {
          $toast.error('Error at sending status notification')
          console.error('Error at sending status notification:', error)
        })
        .finally(() => {
          $router.push({ name: 'charging-stations' })
        })
    }"
  >
    Send Status Notification
  </Button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { convertToInt } from '@/composables'

defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const state = ref<{ status: string }>({ status: 'Available' })
</script>

<style>
#action-button {
  text-align: center;
}
</style>
