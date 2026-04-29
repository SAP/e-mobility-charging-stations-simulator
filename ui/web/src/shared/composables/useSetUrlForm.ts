import { readonly, ref, type Ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/composables/Utils.js'

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
    pending: Readonly<Ref<boolean>>
    resetForm: () => void
    submitForm: () => Promise<boolean>
  } {
  const $uiClient = useUIClient()
  const $toast = useToast()

  const formState = ref<SetUrlFormState>(makeInitialState())
  const pending = ref(false)

  /** Resets form state to initial defaults. */
  function resetForm (): void {
    formState.value = makeInitialState()
  }

  /**
   * Validates and submits the supervision URL update.
   * @returns Whether the submission was successful
   */
  async function submitForm (): Promise<boolean> {
    if (formState.value.supervisionUrl.length === 0) {
      $toast.error('Supervision url is required')
      return false
    }
    if (pending.value) return false
    pending.value = true
    try {
      await $uiClient.setSupervisionUrl(
        hashId,
        formState.value.supervisionUrl,
        formState.value.supervisionUser,
        formState.value.supervisionPassword
      )
      $toast.success('Supervision url successfully set')
      return true
    } catch (error: unknown) {
      $toast.error('Error at setting supervision url')
      console.error('Error at setting supervision url:', error)
      return false
    } finally {
      pending.value = false
    }
  }

  return {
    chargingStationId,
    formState,
    pending: readonly(pending),
    resetForm,
    submitForm,
  }
}

/**
 * Returns a fresh copy of the default form state.
 * Using a factory avoids sharing mutable state between initialization and reset.
 * @returns A new {@link SetUrlFormState} with all fields set to their defaults.
 */
function makeInitialState (): SetUrlFormState {
  return {
    supervisionPassword: '',
    supervisionUrl: '',
    supervisionUser: '',
  }
}
