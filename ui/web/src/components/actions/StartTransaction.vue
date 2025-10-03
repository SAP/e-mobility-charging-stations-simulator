<template>
  <h1 id="action">
    Start Transaction
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <h3>Connector {{ connectorId }}</h3>
  <p>
    RFID tag:
    <input
      id="idtag"
      v-model.trim="state.idTag"
      name="idtag"
      placeholder="RFID tag"
      type="text"
    >
  </p>
  <p>
    Authorize RFID tag:
    <input
      v-model="state.authorizeIdTag"
      false-value="false"
      true-value="true"
      type="checkbox"
    >
  </p>
  <br>
  <Button
    id="action-button"
    @click="
      () => {
        state.authorizeIdTag = convertToBoolean(state.authorizeIdTag)
        if (state.authorizeIdTag) {
          if (state.idTag == null || state.idTag.trim().length === 0) {
            $toast.error('Please provide an RFID tag to authorize')
            return
          }
          $uiClient
            ?.authorize(hashId, state.idTag)
            .then(() => {
              $uiClient
                ?.startTransaction(hashId, convertToInt(connectorId), state.idTag)
                .then(() => {
                  $toast.success('Transaction successfully started')
                })
                .catch((error: Error) => {
                  $toast.error('Error at starting transaction')
                  console.error('Error at starting transaction:', error)
                })
                .finally(() => {
                  resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
                  $router.push({ name: 'charging-stations' })
                })
            })
            .catch((error: Error) => {
              $toast.error('Error at authorizing RFID tag')
              console.error('Error at authorizing RFID tag:', error)
              resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
              $router.push({ name: 'charging-stations' })
            })
        } else {
          $uiClient
            ?.startTransaction(hashId, convertToInt(connectorId), state.idTag)
            .then(() => {
              $toast.success('Transaction successfully started')
            })
            .catch((error: Error) => {
              $toast.error('Error at starting transaction')
              console.error('Error at starting transaction:', error)
            })
            .finally(() => {
              resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
              $router.push({ name: 'charging-stations' })
            })
        }
      }
    "
  >
    Start Transaction
  </Button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { convertToBoolean, convertToInt, resetToggleButtonState } from '@/composables'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const state = ref<{ authorizeIdTag: boolean; idTag: string }>({
  authorizeIdTag: false,
  idTag: '',
})
</script>

<style>
#idtag {
  text-align: center;
}
</style>
