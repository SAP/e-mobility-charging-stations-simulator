<template>
  <Modal
    :title="`Details — ${chargingStationId}`"
    @close="close"
  >
    <p
      v-if="station == null"
      class="station-details__empty"
    >
      Charging station not found.
    </p>
    <div
      v-else
      class="station-details"
    >
      <section
        v-for="section in sections"
        :key="section.title"
        class="station-details__section"
      >
        <h3 class="station-details__title">
          {{ section.title }}
        </h3>
        <dl class="station-details__list">
          <div
            v-for="entry in section.entries"
            :key="entry.label"
            class="station-details__row"
          >
            <dt>{{ entry.label }}</dt>
            <dd>{{ entry.value }}</dd>
          </div>
        </dl>
      </section>
      <section class="station-details__section">
        <h3
          id="station-details-ocpp-title"
          class="station-details__title"
        >
          OCPP Parameters
        </h3>
        <p
          v-if="configurationRows.length === 0"
          class="station-details__empty"
        >
          No OCPP parameters reported
        </p>
        <table
          v-else
          class="station-details__table"
          aria-labelledby="station-details-ocpp-title"
        >
          <thead>
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
      </section>
    </div>
    <template #footer>
      <ActionButton
        variant="ghost"
        @click="close"
      >
        Close
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useChargingStations } from '@/core/index.js'
import { buildConfigurationRows, buildStationDetailSections } from '@/shared/utils/index.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const emit = defineEmits<{ close: [] }>()

const $chargingStations = useChargingStations()

const station = computed(() =>
  $chargingStations.value.find(entry => entry.stationInfo.hashId === props.hashId)
)

const sections = computed(() =>
  station.value != null ? buildStationDetailSections(station.value) : []
)

const configurationRows = computed(() =>
  station.value != null ? buildConfigurationRows(station.value) : []
)

const close = (): void => {
  emit('close')
}
</script>

<style scoped>
.station-details {
  display: flex;
  flex-direction: column;
  gap: var(--skin-space-4);
}

.station-details__title {
  margin: 0 0 var(--skin-space-2);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-strong);
}

.station-details__list {
  margin: 0;
  display: grid;
  gap: var(--skin-space-1) var(--skin-space-3);
}

.station-details__row {
  display: flex;
  justify-content: space-between;
  gap: var(--skin-space-3);
  border-bottom: 1px solid var(--skin-border);
  padding-bottom: var(--skin-space-1);
}

.station-details__row dt {
  color: var(--color-text-muted);
}

.station-details__row dd {
  margin: 0;
  text-align: right;
  word-break: break-word;
  color: var(--color-text);
}

.station-details__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.station-details__table th,
.station-details__table td {
  padding: var(--skin-space-1) var(--skin-space-2);
  border: 1px solid var(--skin-border);
  text-align: left;
  word-break: break-word;
}

.station-details__table thead th {
  color: var(--color-text-strong);
  background-color: var(--skin-surface-sunken);
}

.station-details__empty {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
