import { convertToInt, type OCPPVersion } from 'ui-common'
import { ref, type Ref } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/composables/Utils.js'

export interface StartTxFormConfig {
  connectorId: string
  evseId?: number
  hashId: string
  ocppVersion?: OCPPVersion
  options?: {
    onCleanup?: () => void
    onError?: (error: unknown) => void
  }
}

export interface StartTxFormState {
  authorizeIdTag: boolean
  idTag: string
}

/**
 * Returns form state and submission logic for starting a transaction.
 * @param config - Configuration for the start transaction form
 * @returns Form state and submit/reset functions
 */
export function useStartTxForm (config: StartTxFormConfig): {
  formState: Ref<StartTxFormState>
  resetForm: () => void
  submitForm: () => Promise<boolean>
} {
  const { connectorId, evseId, hashId, ocppVersion, options } = config
  const $uiClient = useUIClient()
  const $toast = useToast()

  const formState = ref<StartTxFormState>({
    authorizeIdTag: true,
    idTag: '',
  })

  /** Resets form state to initial defaults. */
  function resetForm (): void {
    formState.value = {
      authorizeIdTag: true,
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
        options?.onError?.(error)
        options?.onCleanup?.()
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
      options?.onError?.(error)
      return false
    } finally {
      options?.onCleanup?.()
    }
  }

  return {
    formState,
    resetForm,
    submitForm,
  }
}
