import { randomUUID, type UUIDv4 } from 'ui-common'
import { type DeepReadonly, readonly, ref, type Ref, watch } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useTemplates, useUIClient } from '@/core/index.js'

export interface AddStationsFormState {
  autoStart: boolean
  baseName: string
  enableStatistics: boolean
  fixedName: boolean
  numberOfStations: number
  ocppStrictCompliance: boolean
  persistentConfiguration: boolean
  renderTemplates: UUIDv4
  supervisionPassword: string
  supervisionUrl: string
  supervisionUser: string
  template: string
}

/**
 * Returns form state and submission logic for adding charging stations.
 * @param options - Optional callbacks
 * @param options.onFinally - Called after the action completes (success or failure), before form reset
 * @returns Form state, templates, submit, and reset functions
 */
export function useAddStationsForm (options?: { onFinally?: () => void }): {
  formState: Ref<AddStationsFormState>
  pending: Readonly<Ref<boolean>>
  resetForm: () => void
  submitForm: () => Promise<boolean>
  templates: DeepReadonly<Ref<string[]>>
} {
  const $uiClient = useUIClient()
  const $templates = useTemplates()
  const $toast = useToast()

  const formState = ref<AddStationsFormState>(makeInitialState())
  const pending = ref(false)

  watch($templates, (newTemplates, oldTemplates) => {
    // Only regenerate the key when the template list content actually changes.
    // This prevents destroying the user's current selection when an in-flight
    // refresh returns the same set of templates.
    if (!templatesEqual(newTemplates, oldTemplates)) {
      formState.value.renderTemplates = randomUUID()
    }
  })

  /** Resets form state to initial defaults. */
  function resetForm (): void {
    formState.value = makeInitialState()
  }

  /**
   * Submits the form to add charging stations via the UI client.
   * @returns Whether the submission was successful
   */
  async function submitForm (): Promise<boolean> {
    if (formState.value.template.length === 0) {
      $toast.error('Please select a template')
      return false
    }
    if (pending.value) return false
    pending.value = true
    try {
      await $uiClient.addChargingStations(
        formState.value.template,
        formState.value.numberOfStations,
        {
          autoStart: formState.value.autoStart,
          baseName: nonEmpty(formState.value.baseName),
          enableStatistics: formState.value.enableStatistics,
          fixedName: formState.value.baseName.length > 0 ? formState.value.fixedName : undefined,
          ocppStrictCompliance: formState.value.ocppStrictCompliance,
          persistentConfiguration: formState.value.persistentConfiguration,
          supervisionPassword: nonEmpty(formState.value.supervisionPassword),
          supervisionUrls: nonEmpty(formState.value.supervisionUrl),
          supervisionUser: nonEmpty(formState.value.supervisionUser),
        }
      )
      $toast.success('Charging stations successfully added')
      return true
    } catch (error: unknown) {
      $toast.error('Error at adding charging stations')
      console.error('Error at adding charging stations:', error)
      return false
    } finally {
      pending.value = false
      options?.onFinally?.()
      resetForm()
    }
  }

  return {
    formState,
    pending: readonly(pending),
    resetForm,
    submitForm,
    templates: readonly($templates),
  }
}

/**
 * Returns a fresh copy of the default form state.
 * Using a factory avoids sharing mutable state between initialization and reset.
 * @returns A new {@link AddStationsFormState} with all fields set to their defaults.
 */
function makeInitialState (): AddStationsFormState {
  return {
    autoStart: false,
    baseName: '',
    enableStatistics: false,
    fixedName: false,
    numberOfStations: 1,
    ocppStrictCompliance: true,
    persistentConfiguration: true,
    renderTemplates: randomUUID(),
    supervisionPassword: '',
    supervisionUrl: '',
    supervisionUser: '',
    template: '',
  }
}

/**
 * Returns `value` when it is non-empty, otherwise `undefined`.
 * @param value - The string to test.
 * @returns The original string, or `undefined` if it is empty.
 */
function nonEmpty (value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

/**
 * Returns `true` when both arrays have identical length and values in the same order.
 * @param a - The incoming template list.
 * @param b - The previous template list.
 * @returns Whether the two arrays are deeply equal.
 */
function templatesEqual (a: string[], b: string[] | undefined): boolean {
  if (a.length !== b?.length) return false
  return a.every((v, i) => v === b[i])
}
