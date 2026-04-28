<template>
  <Modal
    :title="`Start transaction — ${chargingStationId}`"
    @close="close"
  >
    <form
      class="v2-form"
      @submit.prevent="submit"
    >
      <p style="margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm)">
        {{ targetLabel }}
      </p>
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-tx-idtag"
        >RFID tag</label>
        <input
          id="v2-tx-idtag"
          v-model.trim="form.idTag"
          class="v2-form__input"
          type="text"
          placeholder="optional"
        >
      </div>
      <label class="v2-form__check">
        <input
          v-model="form.authorizeIdTag"
          type="checkbox"
        >
        Authorize the RFID tag first
      </label>
      <div
        v-if="lastFailure != null"
        class="v2-form__error"
      >
        <div class="v2-form__error-summary">
          <strong>{{ lastFailure.label }}</strong>
          <span>{{ lastFailure.info.summary }}</span>
        </div>
        <details
          v-if="lastFailure.info.payload != null"
          class="v2-form__error-details"
        >
          <summary>Response JSON</summary>
          <pre class="v2-form__error-json">{{ formattedPayload }}</pre>
        </details>
      </div>
    </form>
    <template #footer>
      <ActionButton
        variant="ghost"
        @click="close"
      >
        Cancel
      </ActionButton>
      <ActionButton
        variant="primary"
        :pending="pending"
        @click="submit"
      >
        Start
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { convertToInt, type OCPPVersion } from 'ui-common'
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/composables'

import { V2_ROUTE_NAMES } from '../../composables/constants'
import { type FailureInfo, getFailureInfo } from '../../composables/errors'
import ActionButton from '../ActionButton.vue'
import Modal from '../Modal.vue'

const props = defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const $uiClient = useUIClient()
const $router = useRouter()
const $route = useRoute()
const $toast = useToast()

const pending = ref(false)
const lastFailure = ref<null | { info: FailureInfo; label: string }>(null)

const formattedPayload = computed(() =>
  lastFailure.value?.info.payload != null
    ? JSON.stringify(lastFailure.value.info.payload, null, 2)
    : ''
)

const form = reactive({
  authorizeIdTag: true,
  idTag: '',
})

const evseId = computed(() =>
  $route.query.evseId != null ? Number($route.query.evseId) : undefined
)
const ocppVersion = computed(() => $route.query.ocppVersion as OCPPVersion | undefined)

const targetLabel = computed(() =>
  evseId.value != null
    ? `EVSE ${String(evseId.value)} / Connector ${props.connectorId}`
    : `Connector ${props.connectorId}`
)

const close = (): void => {
  $router.push({ name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS }).catch((error: unknown) => {
    console.error('Navigation failed:', error)
  })
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  const idTag = form.idTag.length > 0 ? form.idTag : undefined
  if (form.authorizeIdTag && idTag == null) {
    $toast.error('Provide an RFID tag to authorize')
    return
  }
  pending.value = true
  lastFailure.value = null
  let step: 'authorize' | 'startTransaction' = 'startTransaction'
  try {
    if (form.authorizeIdTag && idTag != null) {
      step = 'authorize'
      await $uiClient.authorize(props.hashId, idTag)
      step = 'startTransaction'
    }
    await $uiClient.startTransaction(props.hashId, {
      connectorId: convertToInt(props.connectorId),
      evseId: evseId.value,
      idTag,
      ocppVersion: ocppVersion.value,
    })
    $toast.success('Transaction started')
    close()
  } catch (error) {
    console.error(`Error during ${step}:`, error)
    const label = step === 'authorize' ? 'Authorize failed' : 'Start transaction failed'
    const info = getFailureInfo(error)
    lastFailure.value = { info, label }
    $toast.error(`${label}: ${info.summary}`)
  } finally {
    pending.value = false
  }
}
</script>
