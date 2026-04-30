<template>
  <tr>
    <td>
      {{ evseId != null ? `${evseId}/${connectorId}` : connectorId }}
    </td>
    <td>
      {{ connector.status ?? EMPTY_VALUE_PLACEHOLDER }}
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
            $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS })
          }
        "
        :on="
          () => {
            $router.push({
              name: ROUTE_NAMES.START_TRANSACTION,
              params: { hashId, chargingStationId, connectorId },
              query: {
                ...(evseId != null ? { evseId: String(evseId) } : {}),
                ...(ocppVersion != null ? { ocppVersion } : {}),
              },
            })
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
import type { ConnectorStatus, OCPPVersion, Status } from 'ui-common'

import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { EMPTY_VALUE_PLACEHOLDER, ROUTE_NAMES } from '@/core'
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

const emit = defineEmits<{ 'need-refresh': [] }>()

const $router = useRouter()

const {
  lockConnector,
  startATG: startAutomaticTransactionGenerator,
  stopATG: stopAutomaticTransactionGenerator,
  stopTransaction: doStopTransaction,
  unlockConnector,
} = useConnectorActions({
  connectorId: computed(() => props.connectorId),
  hashId: computed(() => props.hashId),
  onRefresh: () => emit('need-refresh'),
})

const stopTransaction = (): void => {
  doStopTransaction(props.connector.transactionId, props.ocppVersion)
}
</script>
