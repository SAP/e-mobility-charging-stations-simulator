<template>
  <Modal
    :title="`Change configuration — ${chargingStationId}`"
    @close="close"
  >
    <p
      v-if="station == null"
      class="change-configuration__empty"
    >
      Charging station not found
    </p>
    <p
      v-else-if="editableConfigurationKeys.length === 0"
      class="change-configuration__empty"
    >
      No OCPP parameters reported
    </p>
    <table
      v-else
      class="change-configuration__table"
      :aria-labelledby="tableLabelId"
    >
      <caption
        :id="tableLabelId"
        class="change-configuration__caption"
      >
        OCPP Parameters
      </caption>
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
          <th scope="col">
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="configurationKey in editableConfigurationKeys"
          :key="configurationKey.key"
        >
          <th scope="row">
            {{ configurationKey.key }}
          </th>
          <td>
            <input
              v-model="draftValues[configurationKey.key]"
              :aria-disabled="configurationKey.readonly"
              :aria-label="`Value for ${configurationKey.key}`"
              class="change-configuration__input"
              :disabled="configurationKey.readonly || pending.has(configurationKey.key)"
              type="text"
            >
          </td>
          <td>{{ configurationKey.readonly ? 'Yes' : 'No' }}</td>
          <td>{{ configurationKey.reboot === true ? 'Yes' : 'No' }}</td>
          <td>
            <ActionButton
              :aria-label="`Save ${configurationKey.key}`"
              :disabled="configurationKey.readonly"
              :pending="pending.has(configurationKey.key)"
              variant="primary"
              @click="save(configurationKey)"
            >
              Save
            </ActionButton>
          </td>
        </tr>
      </tbody>
    </table>
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
import { type ConfigurationKey } from 'ui-common'
import { reactive, useId, watch } from 'vue'

import { useChangeConfigurationForm } from '@/shared/composables/useChangeConfigurationForm.js'
import { useStationDetails } from '@/shared/composables/useStationDetails.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../ModernModal.vue'

const props = defineProps<{
  chargingStationId: string
  hashId: string
}>()

const emit = defineEmits<{ close: [] }>()

const tableLabelId = useId()

const { editableConfigurationKeys, station } = useStationDetails(props.hashId)
const { pending, submit } = useChangeConfigurationForm(props.hashId)

const draftValues = reactive<Record<string, string>>({})

watch(
  editableConfigurationKeys,
  configurationKeys => {
    for (const configurationKey of configurationKeys) {
      if (!(configurationKey.key in draftValues)) {
        draftValues[configurationKey.key] = configurationKey.value ?? ''
      }
    }
  },
  { immediate: true }
)

const save = async (configurationKey: ConfigurationKey): Promise<void> => {
  await submit(configurationKey, draftValues[configurationKey.key] ?? '')
}

const close = (): void => {
  emit('close')
}
</script>

<style scoped>
.change-configuration__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.change-configuration__caption {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-bottom: var(--skin-space-2);
}

.change-configuration__table th,
.change-configuration__table td {
  padding: var(--skin-space-1) var(--skin-space-2);
  text-align: left;
}

.change-configuration__table td,
.change-configuration__table th[scope='row'] {
  word-break: break-word;
}

.change-configuration__table thead th {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  border-bottom: 1px solid var(--skin-border);
}

.change-configuration__table th[scope='row'] {
  font-weight: 600;
  color: var(--color-text-strong);
}

.change-configuration__table tbody tr {
  border-bottom: 1px solid var(--skin-border);
}

.change-configuration__input {
  width: 100%;
}

.change-configuration__empty {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
