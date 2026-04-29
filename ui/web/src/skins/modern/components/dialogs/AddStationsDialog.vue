<template>
  <Modal
    title="Add charging stations"
    @close="close"
  >
    <form
      class="modern-form"
      @submit.prevent="submit"
    >
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-add-template"
        >Template</label>
        <select
          id="modern-add-template"
          v-model="formState.template"
          class="modern-form__select"
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
      <div class="modern-form__row">
        <label
          class="modern-form__label"
          for="modern-add-count"
        >How many?</label>
        <input
          id="modern-add-count"
          v-model.number="formState.numberOfStations"
          class="modern-form__input"
          min="1"
          type="number"
          required
        >
      </div>
      <fieldset class="modern-form__row modern-form__fieldset">
        <legend class="modern-form__label">
          Naming
        </legend>
        <input
          v-model.trim="formState.baseName"
          class="modern-form__input"
          type="text"
          placeholder="Base name (defaults to template name)"
        >
        <label class="modern-form__check">
          <input
            v-model="formState.fixedName"
            type="checkbox"
          >
          Fixed name (base name is full station name)
        </label>
      </fieldset>
      <fieldset class="modern-form__row modern-form__fieldset">
        <legend class="modern-form__label">
          Supervision
        </legend>
        <input
          v-model.trim="formState.supervisionUrl"
          class="modern-form__input"
          type="url"
          placeholder="wss://..."
        >
        <input
          v-model.trim="formState.supervisionUser"
          class="modern-form__input"
          type="text"
          placeholder="Username"
        >
        <input
          v-model="formState.supervisionPassword"
          class="modern-form__input"
          type="password"
          placeholder="Password"
        >
        <span class="modern-form__hint">
          Leave blank to use the template's defaults. Any value entered overrides them.
        </span>
      </fieldset>
      <div class="modern-form__row">
        <label class="modern-form__check">
          <input
            v-model="formState.autoStart"
            type="checkbox"
          >
          Auto-start the new stations
        </label>
        <label class="modern-form__check">
          <input
            v-model="formState.persistentConfiguration"
            type="checkbox"
          >
          Persistent configuration
        </label>
        <label class="modern-form__check">
          <input
            v-model="formState.ocppStrictCompliance"
            type="checkbox"
          >
          OCPP strict compliance
        </label>
        <label class="modern-form__check">
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
    await submitForm()
    close()
  } finally {
    pending.value = false
  }
}
</script>
