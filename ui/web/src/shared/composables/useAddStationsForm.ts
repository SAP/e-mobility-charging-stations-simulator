import { randomUUID, type UUIDv4 } from 'ui-common'
import { ref, type Ref, watch } from 'vue'

import { useExecuteAction, useTemplates, useUIClient } from '@/composables/Utils.js'

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
  resetForm: () => void
  submitForm: () => Promise<boolean>
  templates: Ref<string[]>
} {
  const $uiClient = useUIClient()
  const $templates = useTemplates()
  const executeAction = useExecuteAction()

  const formState = ref<AddStationsFormState>(makeInitialState())

  watch($templates, () => {
    formState.value.renderTemplates = randomUUID()
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
    return new Promise<boolean>(resolve => {
      let succeeded = false
      executeAction(
        $uiClient.addChargingStations(formState.value.template, formState.value.numberOfStations, {
          autoStart: formState.value.autoStart,
          baseName: nonEmpty(formState.value.baseName),
          enableStatistics: formState.value.enableStatistics,
          fixedName: formState.value.baseName.length > 0 ? formState.value.fixedName : undefined,
          ocppStrictCompliance: formState.value.ocppStrictCompliance,
          persistentConfiguration: formState.value.persistentConfiguration,
          supervisionPassword: nonEmpty(formState.value.supervisionPassword),
          supervisionUrls: nonEmpty(formState.value.supervisionUrl),
          supervisionUser: nonEmpty(formState.value.supervisionUser),
        }),
        'Charging stations successfully added',
        'Error at adding charging stations',
        {
          onFinally: () => {
            options?.onFinally?.()
            resetForm()
            resolve(succeeded)
          },
          onSuccess: () => {
            succeeded = true
          },
        }
      )
    })
  }

  return {
    formState,
    resetForm,
    submitForm,
    templates: $templates,
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
 * Centralizes the "optional string field" pattern used in form submission.
 * @param value - The string to test.
 * @returns The original string, or `undefined` if it is empty.
 */
function nonEmpty (value: string): string | undefined {
  return value.length > 0 ? value : undefined
}
