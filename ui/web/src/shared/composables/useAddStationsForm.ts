import { convertToBoolean, randomUUID, type UUIDv4 } from 'ui-common'
import { ref, type Ref, watch } from 'vue'

import {
  useExecuteAction,
  useTemplates,
  useUIClient,
} from '@/composables/Utils.js'

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
  submitForm: () => void
  templates: Ref<string[]>
} {
  const $uiClient = useUIClient()
  const $templates = useTemplates()
  const executeAction = useExecuteAction()

  const formState = ref<AddStationsFormState>({
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
  })

  watch($templates, () => {
    formState.value.renderTemplates = randomUUID()
  })

  /** Resets form state to initial defaults. */
  function resetForm (): void {
    formState.value = {
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

  /** Submits the form to add charging stations via the UI client. */
  function submitForm (): void {
    executeAction(
      $uiClient.addChargingStations(formState.value.template, formState.value.numberOfStations, {
        autoStart: convertToBoolean(formState.value.autoStart),
        baseName: formState.value.baseName.length > 0 ? formState.value.baseName : undefined,
        enableStatistics: convertToBoolean(formState.value.enableStatistics),
        fixedName:
          formState.value.baseName.length > 0
            ? convertToBoolean(formState.value.fixedName)
            : undefined,
        ocppStrictCompliance: convertToBoolean(formState.value.ocppStrictCompliance),
        persistentConfiguration: convertToBoolean(formState.value.persistentConfiguration),
        supervisionPassword:
          formState.value.supervisionPassword.length > 0
            ? formState.value.supervisionPassword
            : undefined,
        supervisionUrls:
          formState.value.supervisionUrl.length > 0 ? formState.value.supervisionUrl : undefined,
        supervisionUser:
          formState.value.supervisionUser.length > 0 ? formState.value.supervisionUser : undefined,
      }),
      'Charging stations successfully added',
      'Error at adding charging stations',
      {
        onFinally: () => {
          options?.onFinally?.()
          resetForm()
        },
      }
    )
  }

  return {
    formState,
    resetForm,
    submitForm,
    templates: $templates,
  }
}
