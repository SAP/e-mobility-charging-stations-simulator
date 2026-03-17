<template>
  <h1 id="action">
    Start Transaction
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <div v-if="isLoading">
    Loading station info...
  </div>
  <div v-else>
    <!-- OCPP 1.6: Show connector ID from props (read-only) -->
    <h3 v-if="!isOCPP20x">
      Connector {{ connectorId }}
    </h3>
    <!-- OCPP 2.0.x: Show evseId input -->
    <p v-else>
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
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, ref } from 'vue'

import type { ChargingStationData } from '@/types'

import Button from '@/components/buttons/Button.vue'
import {
  convertToBoolean,
  convertToInt,
  resetToggleButtonState,
  UIClient,
  useUIClient,
} from '@/composables'
import { OCPPVersion, ResponseStatus } from '@/types'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const app = getCurrentInstance()

const state = ref<{ authorizeIdTag: boolean; evseId: number; idTag: string }>({
  authorizeIdTag: false,
  evseId: convertToInt(props.connectorId),
  idTag: '',
})

const ocppVersion = ref<OCPPVersion | undefined>(undefined)
const isLoading = ref(true)

const isOCPP20x = ref(false)

const uiClient = useUIClient()

onMounted(async () => {
  try {
    const response = await uiClient.listChargingStations()
    if (response.status === ResponseStatus.SUCCESS && response.chargingStations != null) {
      const stations = response.chargingStations as ChargingStationData[]
      const station = stations.find(s => s.stationInfo.hashId === props.hashId)
      if (station != null) {
        ocppVersion.value = station.stationInfo.ocppVersion
        isOCPP20x.value = UIClient.isOCPP20x(ocppVersion.value)
      }
    }
  } catch (error) {
    console.error('Failed to fetch station info:', error)
  } finally {
    isLoading.value = false
  }
})

const handleStartTransaction = async (): Promise<void> => {
  state.value.authorizeIdTag = convertToBoolean(state.value.authorizeIdTag)

  // Only authorize for OCPP 1.6 when checkbox is checked
  if (!isOCPP20x.value && state.value.authorizeIdTag) {
    if (state.value.idTag == null || state.value.idTag.trim().length === 0) {
      app?.appContext.config.globalProperties.$toast.error(
        'Please provide an RFID tag to authorize'
      )
      return
    }
    try {
      await uiClient.authorize(props.hashId, state.value.idTag)
    } catch (error) {
      app?.appContext.config.globalProperties.$toast.error('Error at authorizing RFID tag')
      console.error('Error at authorizing RFID tag:', error)
      resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
      app?.appContext.config.globalProperties.$router.push({ name: 'charging-stations' })
      return
    }
    const connectorOrEvseId = isOCPP20x.value ? state.value.evseId : convertToInt(props.connectorId)
    try {
      await uiClient.startTransactionForVersion(
        props.hashId,
        connectorOrEvseId,
        state.value.idTag,
        ocppVersion.value
      )
      app?.appContext.config.globalProperties.$toast.success('Transaction successfully started')
    } catch (error) {
      app?.appContext.config.globalProperties.$toast.error('Error at starting transaction')
      console.error('Error at starting transaction:', error)
    } finally {
      resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
      app?.appContext.config.globalProperties.$router.push({ name: 'charging-stations' })
    }
  } else {
    const connectorOrEvseId = isOCPP20x.value ? state.value.evseId : convertToInt(props.connectorId)
    try {
      await uiClient.startTransactionForVersion(
        props.hashId,
        connectorOrEvseId,
        state.value.idTag,
        ocppVersion.value
      )
      app?.appContext.config.globalProperties.$toast.success('Transaction successfully started')
    } catch (error) {
      app?.appContext.config.globalProperties.$toast.error('Error at starting transaction')
      console.error('Error at starting transaction:', error)
    } finally {
      resetToggleButtonState(`${props.hashId}-${props.connectorId}-start-transaction`, true)
      app?.appContext.config.globalProperties.$router.push({ name: 'charging-stations' })
    }
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
