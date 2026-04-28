import { convertToInt, type OCPPVersion } from 'ui-common'
import { ref, type Ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import { resetToggleButtonState, useUIClient } from '@/composables/Utils.js'

export interface StartTxFormState {
  authorizeIdTag: boolean
  idTag: string
}

/**
 * Returns form state and submission logic for starting a transaction.
 * @param hashId - The charging station hash identifier
 * @param connectorId - The connector identifier string
 * @param evseId - Optional EVSE identifier
 * @param ocppVersion - Optional OCPP version string
 * @returns Form state and submit/reset functions
 */
export function useStartTxForm (
  hashId: string,
  connectorId: string,
  evseId?: number,
  ocppVersion?: OCPPVersion
): {
    formState: Ref<StartTxFormState>
    resetForm: () => void
    submitForm: () => Promise<boolean>
  } {
  const $uiClient = useUIClient()
  const $toast = useToast()

  const toggleButtonId = `${hashId}-${String(evseId ?? 0)}-${connectorId}-start-transaction`

  const formState = ref<StartTxFormState>({
    authorizeIdTag: false,
    idTag: '',
  })

  /** Resets form state to initial defaults. */
  function resetForm (): void {
    formState.value = {
      authorizeIdTag: false,
      idTag: '',
    }
  }

  /**
   * Submits the start transaction request, optionally authorizing first.
   * @returns `true` on success, `false` on error
   */
  async function submitForm (): Promise<boolean> {
    const idTag = formState.value.idTag.length > 0 ? formState.value.idTag : undefined

    if (formState.value.authorizeIdTag) {
      if (idTag == null) {
        $toast.error('Please provide an RFID tag to authorize')
        return false
      }
      try {
        await $uiClient.authorize(hashId, idTag)
      } catch (error) {
        $toast.error('Error at authorizing RFID tag')
        console.error('Error at authorizing RFID tag:', error)
        resetToggleButtonState(toggleButtonId, true)
        return false
      }
    }

    try {
      await $uiClient.startTransaction(hashId, {
        connectorId: convertToInt(connectorId),
        evseId,
        idTag,
        ocppVersion,
      })
      $toast.success('Transaction successfully started')
      return true
    } catch (error) {
      $toast.error('Error at starting transaction')
      console.error('Error at starting transaction:', error)
      return false
    } finally {
      resetToggleButtonState(toggleButtonId, true)
    }
  }

  return {
    formState,
    resetForm,
    submitForm,
  }
}
