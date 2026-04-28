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
          v-model="form.template"
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
            v-for="t in $templates"
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
          v-model.number="form.numberOfStations"
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
          v-model.trim="form.baseName"
          class="v2-form__input"
          type="text"
          placeholder="Base name (defaults to template name)"
        >
        <label class="v2-form__check">
          <input
            v-model="form.fixedName"
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
          v-model.trim="form.supervisionUrl"
          class="v2-form__input"
          type="url"
          placeholder="wss://..."
        >
        <input
          v-model.trim="form.supervisionUser"
          class="v2-form__input"
          type="text"
          placeholder="Username"
        >
        <input
          v-model="form.supervisionPassword"
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
            v-model="form.autoStart"
            type="checkbox"
          >
          Auto-start the new stations
        </label>
        <label class="v2-form__check">
          <input
            v-model="form.persistentConfiguration"
            type="checkbox"
          >
          Persistent configuration
        </label>
        <label class="v2-form__check">
          <input
            v-model="form.ocppStrictCompliance"
            type="checkbox"
          >
          OCPP strict compliance
        </label>
        <label class="v2-form__check">
          <input
            v-model="form.enableStatistics"
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
        :pending="pending"
        @click="submit"
      >
        Add
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import { useTemplates, useUIClient } from '@/composables'

import { V2_ROUTE_NAMES } from '../../composables/constants'
import ActionButton from '../ActionButton.vue'
import Modal from '../Modal.vue'

const $uiClient = useUIClient()
const $templates = useTemplates()
const $router = useRouter()
const $toast = useToast()

const pending = ref(false)

const form = reactive({
  autoStart: false,
  baseName: '',
  enableStatistics: false,
  fixedName: false,
  numberOfStations: 1,
  ocppStrictCompliance: true,
  persistentConfiguration: true,
  supervisionPassword: '',
  supervisionUrl: '',
  supervisionUser: '',
  template: '',
})

const close = (): void => {
  $router.push({ name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS }).catch((error: unknown) => {
    console.error('Navigation failed:', error)
  })
}

const submit = async (): Promise<void> => {
  if (pending.value) return
  if (form.template.length === 0) {
    $toast.error('Please choose a template')
    return
  }
  if (!Number.isFinite(form.numberOfStations) || form.numberOfStations < 1) {
    $toast.error('Number of stations must be at least 1')
    return
  }
  pending.value = true
  try {
    await $uiClient.addChargingStations(form.template, form.numberOfStations, {
      autoStart: form.autoStart,
      baseName: form.baseName.length > 0 ? form.baseName : undefined,
      enableStatistics: form.enableStatistics,
      fixedName: form.baseName.length > 0 ? form.fixedName : undefined,
      ocppStrictCompliance: form.ocppStrictCompliance,
      persistentConfiguration: form.persistentConfiguration,
      supervisionPassword:
        form.supervisionPassword.length > 0 ? form.supervisionPassword : undefined,
      supervisionUrls: form.supervisionUrl.length > 0 ? form.supervisionUrl : undefined,
      supervisionUser: form.supervisionUser.length > 0 ? form.supervisionUser : undefined,
    })
    $toast.success(
      `${String(form.numberOfStations)} charging station${form.numberOfStations === 1 ? '' : 's'} added`
    )
    close()
  } catch (error) {
    console.error('Error adding charging stations:', error)
    $toast.error('Error adding charging stations')
  } finally {
    pending.value = false
  }
}
</script>
