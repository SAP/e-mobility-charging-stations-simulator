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
      v-model.trim="formState.idTag"
      class="idtag"
      name="idtag"
      placeholder="RFID tag"
      type="text"
    >
  </p>
  <p>
    Authorize RFID tag:
    <input
      v-model="formState.authorizeIdTag"
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
import type { OCPPVersion } from 'ui-common'

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ROUTE_NAMES } from '@/composables'
import { resetToggleButtonState } from '@/composables/Utils.js'
import { useStartTxForm } from '@/shared/composables/useStartTxForm.js'

import Button from '../buttons/Button.vue'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const $router = useRouter()
const $route = useRoute()

const evseId = computed(() =>
  $route.query.evseId != null ? Number($route.query.evseId) : undefined
)
const ocppVersion = computed(() => $route.query.ocppVersion as OCPPVersion | undefined)

const toggleButtonId = computed(
  () => `${props.hashId}-${String(evseId.value ?? 0)}-${props.connectorId}-start-transaction`
)

const { formState, submitForm } = useStartTxForm(
  props.hashId,
  props.connectorId,
  evseId.value,
  ocppVersion.value,
  {
    onCleanup: () => {
      resetToggleButtonState(toggleButtonId.value, true)
    },
  }
)

const handleStartTransaction = async (): Promise<void> => {
  await submitForm()
  $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
}
</script>

<style scoped>
.idtag {
  text-align: center;
}
</style>
