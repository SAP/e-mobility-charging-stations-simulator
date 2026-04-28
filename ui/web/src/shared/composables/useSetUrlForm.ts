import { ref, type Ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useExecuteAction, useUIClient } from '@/composables/Utils.js'

export interface SetUrlFormState {
  supervisionPassword: string
  supervisionUrl: string
  supervisionUser: string
}

/**
 * Returns form state and submission logic for setting the supervision URL.
 * @param hashId - The charging station hash identifier
 * @param chargingStationId - The charging station display identifier
 * @returns Form state and submit/reset functions
 */
export function useSetUrlForm (
  hashId: string,
  chargingStationId: string
): {
    chargingStationId: string
    formState: Ref<SetUrlFormState>
    resetForm: () => void
    submitForm: () => void
  } {
  const $uiClient = useUIClient()
  const $toast = useToast()
  const executeAction = useExecuteAction()

  const formState = ref<SetUrlFormState>({
    supervisionPassword: '',
    supervisionUrl: '',
    supervisionUser: '',
  })

  /** Resets form state to initial defaults. */
  function resetForm (): void {
    formState.value = {
      supervisionPassword: '',
      supervisionUrl: '',
      supervisionUser: '',
    }
  }

  /** Validates and submits the supervision URL update. */
  function submitForm (): void {
    if (formState.value.supervisionUrl.length === 0) {
      $toast.error('Supervision url is required')
      return
    }
    executeAction(
      $uiClient.setSupervisionUrl(
        hashId,
        formState.value.supervisionUrl,
        formState.value.supervisionUser.length > 0 ? formState.value.supervisionUser : undefined,
        formState.value.supervisionPassword.length > 0
          ? formState.value.supervisionPassword
          : undefined
      ),
      'Supervision url successfully set',
      'Error at setting supervision url'
    )
  }

  return {
    chargingStationId,
    formState,
    resetForm,
    submitForm,
  }
}
