<template>
  <h1 class="classic-action-header">
    Show Details
  </h1>
  <h2>{{ chargingStationId }}</h2>
  <p
    v-if="station == null"
    class="show-details__empty"
  >
    Charging station not found
  </p>
  <template v-else>
    <table
      v-for="section in sections"
      :key="section.title"
      class="data-table data-table--bordered show-details__section"
    >
      <caption class="data-table__caption">
        {{
          section.title
        }}
      </caption>
      <tbody>
        <tr
          v-for="entry in section.entries"
          :key="entry.label"
        >
          <th scope="row">
            {{ entry.label }}
          </th>
          <td>{{ entry.value }}</td>
        </tr>
      </tbody>
    </table>
    <table class="data-table data-table--bordered show-details__section">
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
        </tr>
      </thead>
      <tbody>
        <tr v-if="configurationRows.length === 0">
          <td colspan="4">
            No OCPP parameters reported
          </td>
        </tr>
        <tr
          v-for="row in configurationRows"
          :key="row.key"
        >
          <th scope="row">
            {{ row.key }}
          </th>
          <td>{{ row.value }}</td>
          <td>{{ row.readonly }}</td>
          <td>{{ row.reboot }}</td>
        </tr>
      </tbody>
    </table>
  </template>
  <Button
    id="action-button"
    @click="close()"
  >
    Close
  </Button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import { resetToggleButtonState, ROUTE_NAMES } from '@/core/index.js'
import { useStationDetails } from '@/shared/composables/useStationDetails.js'

import Button from '../buttons/ClassicButton.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const $router = useRouter()

const { configurationRows, sections, station } = useStationDetails(props.hashId)

const close = (): void => {
  resetToggleButtonState(`${props.hashId}-show-details`, true)
  $router.push({ name: ROUTE_NAMES.CHARGING_STATIONS }).catch(() => undefined)
}
</script>

<style scoped>
/* Keep the details in a right-hand panel: bound the width so the shared
 * action container (min-width: max-content) does not balloon to fill the
 * main area, and let long keys/values wrap instead of widening the panel. */
.show-details__section {
  width: 32rem;
  max-width: 100%;
  margin-bottom: var(--spacing-lg);
}

.show-details__section:last-of-type {
  margin-bottom: 0;
}

.show-details__section :is(th, td) {
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

/* Set the key column apart from its value: header fill + weight + divider. */
.show-details__section th[scope='row'] {
  font-weight: bold;
  background-color: var(--color-bg-header);
  border-right: solid 0.25px var(--color-border);
}

.show-details__empty {
  text-align: center;
}
</style>
