<template>
  <h1 class="action-header">
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
  <p>
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
import { type OCPPVersion } from 'ui-common'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import Button from '@/components/buttons/Button.vue'
import { convertToInt, resetToggleButtonState, ROUTE_NAMES, useUIClient } from '@/composables'

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

const state = ref<{ authorizeIdTag: boolean; idTag: string }>({
  authorizeIdTag: false,
  idTag: '',
})

const $uiClient = useUIClient()

const toggleButtonId = computed(
  () => `${props.hashId}-${evseId.value ?? 0}-${props.connectorId}-start-transaction`
)

const handleStartTransaction = async (): Promise<void> => {
  const idTag = state.value.idTag.length > 0 ? state.value.idTag : undefined

  if (state.value.authorizeIdTag) {
    if (idTag == null) {
      $toast.error('Please provide an RFID tag to authorize')
      return
    }
    try {
      await $uiClient.authorize(props.hashId, idTag)
    } catch (error) {
      $toast.error('Error at authorizing RFID tag')
      console.error('Error at authorizing RFID tag:', error)
      resetToggleButtonState(toggleButtonId.value, true)
      $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
      return
    }
  }

  try {
    await $uiClient.startTransaction(props.hashId, {
      connectorId: convertToInt(props.connectorId),
      evseId: evseId.value,
      idTag,
      ocppVersion: ocppVersion.value,
    })
    $toast.success('Transaction successfully started')
  } catch (error) {
    $toast.error('Error at starting transaction')
    console.error('Error at starting transaction:', error)
  } finally {
    resetToggleButtonState(toggleButtonId.value, true)
    $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
  }
}
</script>

<style scoped>
.idtag {
  text-align: center;
}
</style>
