<template>
  <Modal
    title="Add charging stations"
    @close="close"
  >
    <form
      class="v2-form"
      @submit.prevent="submit"
    >
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-add-template"
        >Template</label>
        <select
          id="v2-add-template"
          v-model="formState.template"
          class="v2-form__select"
          required
        >
          <option
            disabled
            value=""
          >
            — select a template —
          </option>
          <option
            v-for="t in templates"
            :key="t"
            :value="t"
          >
            {{ t }}
          </option>
        </select>
      </div>
      <div class="v2-form__row">
        <label
          class="v2-form__label"
          for="v2-add-count"
        >How many?</label>
        <input
          id="v2-add-count"
          v-model.number="formState.numberOfStations"
          class="v2-form__input"
          min="1"
          type="number"
          required
        >
      </div>
      <fieldset
        class="v2-form__row"
        style="border: none; padding: 0; margin: 0"
      >
        <legend class="v2-form__label">
          Naming
        </legend>
        <input
          v-model.trim="formState.baseName"
          class="v2-form__input"
          type="text"
          placeholder="Base name (defaults to template name)"
        >
        <label class="v2-form__check">
          <input
            v-model="formState.fixedName"
            type="checkbox"
          >
          Fixed name (base name is full station name)
        </label>
      </fieldset>
      <fieldset
        class="v2-form__row"
        style="border: none; padding: 0; margin: 0"
      >
        <legend class="v2-form__label">
          Supervision
        </legend>
        <input
          v-model.trim="formState.supervisionUrl"
          class="v2-form__input"
          type="url"
          placeholder="wss://..."
        >
        <input
          v-model.trim="formState.supervisionUser"
          class="v2-form__input"
          type="text"
          placeholder="Username"
        >
        <input
          v-model="formState.supervisionPassword"
          class="v2-form__input"
          type="password"
          placeholder="Password"
        >
        <span class="v2-form__hint">
          Leave blank to use the template's defaults. Any value entered overrides them.
        </span>
      </fieldset>
      <div class="v2-form__row">
        <label class="v2-form__check">
          <input
            v-model="formState.autoStart"
            type="checkbox"
          >
          Auto-start the new stations
        </label>
        <label class="v2-form__check">
          <input
            v-model="formState.persistentConfiguration"
            type="checkbox"
          >
          Persistent configuration
        </label>
        <label class="v2-form__check">
          <input
            v-model="formState.ocppStrictCompliance"
            type="checkbox"
          >
          OCPP strict compliance
        </label>
        <label class="v2-form__check">
          <input
            v-model="formState.enableStatistics"
            type="checkbox"
          >
          Performance statistics
        </label>
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
        @click="submit"
      >
        Add
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { useAddStationsForm } from '@/shared/composables/useAddStationsForm.js'

import ActionButton from '../ActionButton.vue'
import Modal from '../Modal.vue'

const emit = defineEmits<{ close: [] }>()

const pending = ref(false)

const { formState, submitForm, templates } = useAddStationsForm()

const close = (): void => {
  emit('close')
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  pending.value = true
  try {
    submitForm()
    close()
  } finally {
    pending.value = false
  }
}
</script>
