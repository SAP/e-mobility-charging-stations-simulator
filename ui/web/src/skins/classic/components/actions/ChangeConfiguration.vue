<template>
  <h1 class="classic-action-header">
    Change Configuration
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <template v-if="station == null">
    <p class="change-configuration__empty">
      Charging station not found
    </p>
    <Button
      id="action-button"
      @click="close()"
    >
      Back to Charging Stations
    </Button>
  </template>
  <template v-else>
    <table class="data-table data-table--bordered change-configuration__table">
      <caption class="data-table__caption">
        OCPP Parameters
      </caption>
      <thead class="data-table__head">
        <tr>
          <th scope="col">
            Key
          </th>
          <th scope="col">
            Value
          </th>
          <th scope="col">
            Readonly
          </th>
          <th scope="col">
            Reboot
          </th>
          <th scope="col">
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="visibleConfigurationKeys.length === 0">
          <td colspan="5">
            No OCPP parameters reported
          </td>
        </tr>
        <tr
          v-for="configurationKey in visibleConfigurationKeys"
          :key="configurationKey.key"
        >
          <th scope="row">
            {{ configurationKey.key }}
          </th>
          <td>
            <input
              v-model="draftValues[configurationKey.key]"
              :aria-label="`Value for ${configurationKey.key}`"
              class="change-configuration__input"
              :disabled="configurationKey.readonly || pending.has(configurationKey.key)"
              :name="`configuration-value-${configurationKey.key}`"
              type="text"
            >
          </td>
          <td>{{ formatBoolean(configurationKey.readonly) }}</td>
          <td>{{ formatBoolean(configurationKey.reboot) }}</td>
          <td>
            <Button
              :aria-busy="pending.has(configurationKey.key) || undefined"
              :aria-label="`Save ${configurationKey.key}`"
              :disabled="configurationKey.readonly || pending.has(configurationKey.key)"
              @click="save(configurationKey)"
            >
              Save
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
    <Button
      id="action-button"
      @click="close()"
    >
      Back to Charging Stations
    </Button>
  </template>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import { resetToggleButtonState, ROUTE_NAMES } from '@/core/index.js'
import { useChangeConfigurationForm } from '@/shared/composables/useChangeConfigurationForm.js'
import { useStationDetails } from '@/shared/composables/useStationDetails.js'
import { formatBoolean } from '@/shared/utils/index.js'

import Button from '../buttons/ClassicButton.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const $router = useRouter()

const { station, visibleConfigurationKeys } = useStationDetails(props.hashId)
const { draftValues, pending, save } = useChangeConfigurationForm(
  props.hashId,
  visibleConfigurationKeys
)

const close = (): void => {
  resetToggleButtonState(`${props.hashId}-change-configuration`, true)
  $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS }).catch(() => undefined)
}
</script>

<style scoped>
/* Bound the width: the shared action container is `min-width: max-content`,
 * so uncapped this table would grow it to fill the main area. */
.change-configuration__table {
  width: 40rem;
  margin-bottom: var(--spacing-lg);
}

.change-configuration__table :is(th, td) {
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.change-configuration__table th[scope='row'] {
  font-weight: bold;
  background-color: var(--color-bg-header);
  border-right: solid 0.25px var(--color-border);
}

.change-configuration__input {
  width: 100%;
}

.change-configuration__empty {
  text-align: center;
}
</style>
