<template>
  <Modal
    :title="`Show details — ${chargingStationId}`"
    @close="close"
  >
    <p
      v-if="station == null"
      class="station-details__empty"
    >
      Charging station not found
    </p>
    <div
      v-else
      class="station-details"
    >
      <section
        v-for="(section, index) in sections"
        :key="section.title"
        class="station-details__section"
      >
        <h3
          :id="`${sectionsBaseId}-section-${index}`"
          class="modern-section-label"
        >
          {{ section.title }}
        </h3>
        <dl
          class="station-details__list"
          :aria-labelledby="`${sectionsBaseId}-section-${index}`"
        >
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
          :id="`${sectionsBaseId}-ocpp`"
          class="modern-section-label"
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
          :aria-labelledby="`${sectionsBaseId}-ocpp`"
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
import { useId } from 'vue'

import { useStationDetails } from '@/shared/composables/useStationDetails.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const emit = defineEmits<{ close: [] }>()

const sectionsBaseId = useId()

const { configurationRows, sections, station } = useStationDetails(props.hashId)

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

.station-details__section {
  display: flex;
  flex-direction: column;
  gap: var(--skin-space-2);
  padding: var(--skin-space-3);
  background-color: var(--skin-surface-sunken);
  border: 1px solid var(--skin-border);
  border-radius: var(--skin-radius-lg);
}

.station-details__section > h3 {
  font-size: 0.8125rem;
  color: var(--color-text-strong);
  padding-bottom: var(--skin-space-2);
  border-bottom: 1px solid var(--skin-border);
}

.station-details__list {
  margin: 0;
  display: grid;
  gap: var(--skin-space-2);
}

.station-details__row {
  display: grid;
  grid-template-columns: minmax(9rem, 12rem) 1fr;
  gap: var(--skin-space-1) var(--skin-space-3);
  align-items: baseline;
}

.station-details__row + .station-details__row {
  padding-top: var(--skin-space-2);
  border-top: 1px solid var(--skin-border);
}

.station-details__row dt {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.station-details__row dd {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-strong);
  word-break: break-word;
}

.station-details__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.station-details__table th,
.station-details__table td {
  padding: var(--skin-space-1) var(--skin-space-2);
  text-align: left;
}

.station-details__table td,
.station-details__table th[scope='row'] {
  word-break: break-word;
}

.station-details__table thead th {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  border-bottom: 1px solid var(--skin-border);
}

.station-details__table th[scope='row'] {
  font-weight: 600;
  color: var(--color-text-strong);
}

.station-details__table tbody tr {
  border-bottom: 1px solid var(--skin-border);
}

.station-details__empty {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
