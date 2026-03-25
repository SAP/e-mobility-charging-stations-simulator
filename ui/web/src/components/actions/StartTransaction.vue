<template>
  <h1 class="action">
    Start Transaction
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <h3 v-if="evseId != null">
    EVSE {{ evseId }} / Connector {{ connectorId }}
  </h3>
  <h3 v-else>
    Connector {{ connectorId }}
  </h3>
  <p>
    RFID tag:
    <input
      id="idtag"
      v-model.trim="state.idTag"
      class="idtag"
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
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import Button from '@/components/buttons/Button.vue'
import {
  convertToInt,
  refreshChargingStations,
  resetToggleButtonState,
  UIClient,
  useUIClient,
} from '@/composables'
import { type OCPPVersion } from '@/types'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const $toast = useToast()
const $router = useRouter()
const $route = useRoute()

const evseId = computed(() =>
  $route.query.evseId != null ? Number($route.query.evseId) : undefined
)
const ocppVersion = computed(() => $route.query.ocppVersion as OCPPVersion | undefined)
const isOCPP20x = computed(() => UIClient.isOCPP20x(ocppVersion.value))

const state = ref<{ authorizeIdTag: boolean; idTag: string }>({
  authorizeIdTag: false,
  idTag: '',
})

const uiClient = useUIClient()

const toggleButtonId = computed(
  () => `${props.hashId}-${evseId.value ?? 0}-${props.connectorId}-start-transaction`
)

const handleStartTransaction = async (): Promise<void> => {
  const idTag = state.value.idTag.trim().length > 0 ? state.value.idTag.trim() : undefined

  if (!isOCPP20x.value && state.value.authorizeIdTag) {
    if (idTag == null) {
      $toast.error('Please provide an RFID tag to authorize')
      return
    }
    try {
      await uiClient.authorize(props.hashId, idTag)
    } catch (error) {
      $toast.error('Error at authorizing RFID tag')
      console.error('Error at authorizing RFID tag:', error)
      resetToggleButtonState(toggleButtonId.value, true)
      $router.push({ name: 'charging-stations' })
      return
    }
  }

  try {
    await uiClient.startTransaction(props.hashId, {
      connectorId: convertToInt(props.connectorId),
      evseId: evseId.value,
      idTag,
      ocppVersion: ocppVersion.value,
    })
    $toast.success('Transaction successfully started')
    await refreshChargingStations()
  } catch (error) {
    $toast.error('Error at starting transaction')
    console.error('Error at starting transaction:', error)
  } finally {
    resetToggleButtonState(toggleButtonId.value, true)
    $router.push({ name: 'charging-stations' })
  }
}
</script>

<style scoped>
.action {
  min-width: max-content;
  color: var(--color-text-strong);
  background-color: var(--color-bg-caption);
  padding: var(--spacing-lg);
}

.idtag {
  text-align: center;
}
</style>
