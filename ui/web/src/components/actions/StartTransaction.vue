<template>
  <h1 id="action">
    Start Transaction
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <h3>Connector {{ connectorId }}</h3>
  <p>Scan RFID tag:</p>
  <input
    id="idtag"
    v-model.trim="state.idTag"
    name="idtag"
    placeholder="RFID tag"
    type="text"
  >
  <br>
  <Button
    id="action-button"
    @click="
      () => {
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
            $router.push({ name: 'charging-stations' })
          })
      }
    "
  >
    Start Transaction
  </Button>
</template>

<script setup lang="ts">
import Button from '@/components/buttons/Button.vue'
import { convertToInt } from '@/composables'
import { ref } from 'vue'

defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const state = ref<{ idTag: string }>({
  idTag: '',
})
</script>

<style>
#idtag {
  text-align: center;
}
</style>
