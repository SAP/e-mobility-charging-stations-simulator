<template>
  <tr>
    <td>
      {{ evseId != null ? `${evseId}/${connectorId}` : connectorId }}
    </td>
    <td>
      {{ connector.locked === true ? 'Yes' : 'No' }}
    </td>
    <td>
      {{ connector.transactionStarted === true ? `Yes (${connector.transactionId})` : 'No' }}
    </td>
    <td>
      {{ atgStatus?.start === true ? 'Yes' : 'No' }}
    </td>
    <td>
      <select
        v-model="selectedStatus"
        class="connector-action-select"
        :aria-label="`Set status for connector ${connectorId}`"
        @change="applyConnectorStatus"
      >
        <option
          v-for="s in statusOptions"
          :key="s"
          :value="s"
        >
          {{ s }}
        </option>
      </select>
      <select
        v-if="!isOCPP20x(ocppVersion)"
        v-model="selectedErrorCode"
        class="connector-action-select"
        :aria-label="`Set error code for connector ${connectorId}`"
        @change="applyConnectorStatus"
      >
        <option
          v-for="e in errorCodeOptions"
          :key="e"
          :value="e"
        >
          {{ e }}
        </option>
      </select>
      <StateButton
        :active="connector.locked === true"
        :off="() => unlockConnector()"
        off-label="Unlock"
        :on="() => lockConnector()"
        on-label="Lock"
      />
      <ToggleButton
        v-if="connector.transactionStarted !== true"
        :id="`${hashId}-${evseId ?? 0}-${connectorId}-start-transaction`"
        :off="
          () => {
            $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS }).catch(() => undefined)
          }
        "
        :on="
          () => {
            $router
              .push({
                name: ROUTE_NAMES.START_TRANSACTION,
                params: { hashId, chargingStationId, connectorId },
                query: {
                  ...(evseId != null ? { evseId: String(evseId) } : {}),
                  ...(ocppVersion != null ? { ocppVersion } : {}),
                },
              })
              .catch(() => undefined)
          }
        "
        :shared="true"
        @clicked="$emit('need-refresh')"
      >
        Start Transaction
      </ToggleButton>
      <Button
        v-else
        @click="stopTransaction()"
      >
        Stop Transaction
      </Button>
      <StateButton
        :active="atgStatus?.start === true"
        :off="() => stopAutomaticTransactionGenerator()"
        off-label="Stop ATG"
        :on="() => startAutomaticTransactionGenerator()"
        on-label="Start ATG"
      />
    </td>
  </tr>
</template>

<script setup lang="ts">
import type { ChargePointStatus, ConnectorStatus, OCPPVersion, Status } from 'ui-common'

import {
  isOCPP20x,
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  OCPP20ConnectorStatusEnumType,
} from 'ui-common'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE_NAMES } from '@/core/index.js'
import { useConnectorActions } from '@/shared/composables/useConnectorActions.js'

import Button from '../buttons/ClassicButton.vue'
import StateButton from '../buttons/StateButton.vue'
import ToggleButton from '../buttons/ToggleButton.vue'

const props = defineProps<{
  atgStatus?: Status
  chargingStationId: string
  connector: ConnectorStatus
  connectorId: number
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
}>()

defineEmits<{ 'need-refresh': [] }>()

const $router = useRouter()

const {
  lockConnector,
  setConnectorStatus,
  startATG: startAutomaticTransactionGenerator,
  stopATG: stopAutomaticTransactionGenerator,
  stopTransaction: doStopTransaction,
  unlockConnector,
} = useConnectorActions({
  connectorId: computed(() => props.connectorId),
  evseId: computed(() => props.evseId),
  hashId: computed(() => props.hashId),
  ocppVersion: computed(() => props.ocppVersion),
})

const statusOptions = computed(() =>
  isOCPP20x(props.ocppVersion)
    ? Object.values(OCPP20ConnectorStatusEnumType)
    : Object.values(OCPP16ChargePointStatus)
)
const errorCodeOptions = Object.values(OCPP16ChargePointErrorCode)
const selectedStatus = ref<ChargePointStatus>(
  isOCPP20x(props.ocppVersion)
    ? ((props.connector.status as OCPP20ConnectorStatusEnumType | undefined) ??
        OCPP20ConnectorStatusEnumType.AVAILABLE)
    : ((props.connector.status as OCPP16ChargePointStatus | undefined) ??
        OCPP16ChargePointStatus.AVAILABLE)
)
const selectedErrorCode = ref<OCPP16ChargePointErrorCode>(OCPP16ChargePointErrorCode.NO_ERROR)

watch(
  () => props.connector.status,
  newStatus => {
    if (newStatus != null) {
      selectedStatus.value = newStatus
    }
  }
)

const stopTransaction = (): void => {
  doStopTransaction(props.connector.transactionId, props.ocppVersion)
}

const applyConnectorStatus = (): void => {
  const errorCode = isOCPP20x(props.ocppVersion) ? undefined : selectedErrorCode.value
  setConnectorStatus(selectedStatus.value, undefined, errorCode)
}
</script>

<style scoped>
.connector-action-select {
  display: block;
  width: 100%;
  text-align: center;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
</style>
