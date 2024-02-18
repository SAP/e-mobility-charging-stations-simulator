<template>
  <h2>Action Start Transaction</h2>
  <h3>Connector {{ connectorId }} on {{ chargingStationId }}</h3>
  <p>Scan RFID tag:</p>
  <input id="idtag" v-model.trim="state.idTag" type="text" name="idtag" placeholder="RFID tag" />
  <br />
  <Button
    @click="
      () => {
        uiClient
          .startTransaction(props.hashId, parseInt(props.connectorId), state.idTag)
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
  <Button @click="$router.push({ name: 'charging-stations' })">Cancel</Button>
</template>

<script setup lang="ts">
import { getCurrentInstance, reactive } from 'vue'
import Button from '@/components/buttons/Button.vue'

const props = defineProps<{
  hashId: string
  chargingStationId: string
  connectorId: string
}>()

const state = reactive({
  idTag: ''
})

const uiClient = getCurrentInstance()?.appContext.config.globalProperties.$uiClient
</script>

<style>
#idtag {
  text-align: center;
}
</style>
