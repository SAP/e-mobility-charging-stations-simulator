<template>
  <tr class="connectors-table__row">
    <td class="connectors-table__column">
      <DataTag
        appearance="brand"
        :is-bold="true"
      >
        {{ connectorId }}
      </DataTag>
    </td>
    <td class="connectors-table__column">
      <DataBadge
        :appearance="getStatusAppearance(connector.status)"
        :is-bold="false"
      >
        {{ connector.status ?? 'None' }}
      </DataBadge>
    </td>
    <td class="connectors-table__column connectors-table__column-with-actions">
      <div class="column-data">
        <DataBadge
          :appearance="connector.transactionStarted === true ? 'success' : 'neutral'"
          :is-bold="false"
        >
          {{ connector.transactionStarted === true ? `Yes (${connector.transactionId})` : 'No' }}
        </DataBadge>
      </div>
      <div class="column-actions">
        <Button
          v-if="connector.transactionStarted !== true"
          class="inline-action-button"
          title="Start transaction"
          @click="() => {
            $router.push({
              name: 'start-transaction',
              params: { hashId, chargingStationId, connectorId },
            })
          }"
        >
          <span class="flex items-center gap-1">
            <Play :size="12" />
          </span>
        </Button>
        <Button
          v-if="connector.transactionStarted"
          class="inline-action-button"
          title="Stop transaction"
          @click="stopTransaction()"
        >
          <span class="flex items-center gap-1">
            <Square :size="12" />
          </span>
        </Button>
      </div>
    </td>
    <td class="connectors-table__column connectors-table__column-with-actions">
      <div class="column-data">
        <DataBadge
          :appearance="atgStatus?.start === true ? 'success' : 'neutral'"
          :is-bold="false"
        >
          {{ atgStatus?.start === true ? 'Yes' : 'No' }}
        </DataBadge>
      </div>
      <div class="column-actions">
        <Button
          v-if="atgStatus?.start !== true"
          class="inline-action-button"
          title="Start Automatic Transaction Generator"
          @click="startAutomaticTransactionGenerator()"
        >
          <span class="flex items-center gap-1">
            <Play :size="12" />
            <span class="text-xs">ATG</span>
          </span>
        </Button>
        <Button
          v-if="atgStatus?.start === true"
          class="inline-action-button"
          title="Stop Automatic Transaction Generator"
          @click="stopAutomaticTransactionGenerator()"
        >
          <span class="flex items-center gap-1">
            <Square :size="12" />
            <span class="text-xs">ATG</span>
          </span>
        </Button>
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { Play, Square } from 'lucide-vue-next'
import { useToast } from 'vue-toast-notification'

import type { ConnectorStatus, Status } from '@/types'

import Button from '@/components/buttons/Button.vue'
import DataBadge from '@/components/buttons/DataBadge.vue'
import DataTag from '@/components/buttons/DataTag.vue'
import { useUIClient } from '@/composables'

const props = defineProps<{
  atgStatus?: Status
  chargingStationId: string
  connector: ConnectorStatus
  connectorId: number
  hashId: string
}>()

const $emit = defineEmits(['need-refresh'])

const uiClient = useUIClient()

const $toast = useToast()

// Helper function to determine badge appearance based on connector status
const getStatusAppearance = (status?: string): string => {
  switch (status) {
    case 'Available':
      return 'success'
    case 'Charging':
      return 'success'
    case 'Faulted':
      return 'danger'
    case 'Finishing':
      return 'information'
    case 'Preparing':
      return 'information'
    case 'Reserved':
      return 'information'
    case 'SuspendedEV':
    case 'SuspendedEVSE':
      return 'warning'
    case 'Unavailable':
      return 'danger'
    default:
      return 'neutral'
  }
}

const stopTransaction = (): void => {
  if (props.connector.transactionId == null) {
    $toast.error('No transaction to stop')
    return
  }
  uiClient
    .stopTransaction(props.hashId, props.connector.transactionId)
    .then(() => {
      return $toast.success('Transaction successfully stopped')
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping transaction')
      console.error('Error at stopping transaction:', error)
    })
}
const startAutomaticTransactionGenerator = (): void => {
  uiClient
    .startAutomaticTransactionGenerator(props.hashId, props.connectorId)
    .then(() => {
      return $toast.success('Automatic transaction generator successfully started')
    })
    .catch((error: Error) => {
      $toast.error('Error at starting automatic transaction generator')
      console.error('Error at starting automatic transaction generator:', error)
    })
}
const stopAutomaticTransactionGenerator = (): void => {
  uiClient
    .stopAutomaticTransactionGenerator(props.hashId, props.connectorId)
    .then(() => {
      return $toast.success('Automatic transaction generator successfully stopped')
    })
    .catch((error: Error) => {
      $toast.error('Error at stopping automatic transaction generator')
      console.error('Error at stopping automatic transaction generator:', error)
    })
}
</script>

<style>
/* Override flex display for connector table cells */
.connectors-table__column {
  display: table-cell;
  text-align: left;
  padding: 8px;
  vertical-align: top;
  width: 25%;
}

/* Style for columns with actions */
.connectors-table__column-with-actions {
  display: table-cell;
  text-align: left;
  padding: 8px;
  vertical-align: top;
  width: 25%;
}

.column-data {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.column-actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.inline-action-button {
  font-size: 0.75rem !important;
  padding: 0.25rem 0.5rem !important;
  white-space: nowrap;
}
</style>
