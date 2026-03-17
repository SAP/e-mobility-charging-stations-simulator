<template>
  <h1 id="action">
    Start Transaction
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <p v-if="isOCPP20x">
    EVSE ID:
    <input
      id="evseid"
      v-model.number="state.evseId"
      min="1"
      name="evseid"
      placeholder="EVSE ID"
      type="number"
    >
  </p>
  <h3 v-else>
    Connector {{ connectorId }}
  </h3>
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
  <p v-if="!isOCPP20x">
    Authorize RFID tag:
    <input
      v-model="state.authorizeIdTag"
      type="checkbox"
    >
  </p>
  <br>
  <Button
    id="action-button"
    @click="handleStartTransaction"
  >
    Start Transaction
  </Button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import Button from '@/components/buttons/Button.vue'
import { convertToInt, resetToggleButtonState, UIClient, useUIClient } from '@/composables'
import { type OCPPVersion } from '@/types'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
  ocppVersion?: string
}>()

const $toast = useToast()
const $router = useRouter()

const state = ref<{ authorizeIdTag: boolean; evseId: number; idTag: string }>({
  authorizeIdTag: false,
  evseId: convertToInt(props.connectorId),
  idTag: '',
})

const isOCPP20x = computed(() => UIClient.isOCPP20x(props.ocppVersion as OCPPVersion | undefined))

const uiClient = useUIClient()

const handleStartTransaction = async (): Promise<void> => {
  // Only authorize for OCPP 1.6 when checkbox is checked
  if (!isOCPP20x.value && state.value.authorizeIdTag) {
    if (state.value.idTag.trim().length === 0) {
      $toast.error('Please provide an RFID tag to authorize')
      return
    }
    try {
      await uiClient.authorize(props.hashId, state.value.idTag)
    } catch (error) {
      $toast.error('Error at authorizing RFID tag')
      console.error('Error at authorizing RFID tag:', error)
      resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
      $router.push({ name: 'charging-stations' })
      return
    }
  }

  const connectorOrEvseId = isOCPP20x.value ? state.value.evseId : convertToInt(props.connectorId)
  try {
    await uiClient.startTransaction(
      props.hashId,
      connectorOrEvseId,
      state.value.idTag,
      props.ocppVersion as OCPPVersion | undefined
    )
    $toast.success('Transaction successfully started')
  } catch (error) {
    $toast.error('Error at starting transaction')
    console.error('Error at starting transaction:', error)
  } finally {
    resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
    $router.push({ name: 'charging-stations' })
  }
}
</script>

<style>
#idtag {
  text-align: center;
}

#evseid {
  text-align: center;
}
</style>
