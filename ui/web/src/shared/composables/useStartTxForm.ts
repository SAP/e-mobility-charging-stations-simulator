import { convertToInt, type OCPPVersion } from 'ui-common'
import { type MaybeRef, readonly, ref, type Ref, toValue } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/core/index.js'

export interface StartTxFormConfig {
  connectorId: string
  evseId?: MaybeRef<number | undefined>
  hashId: string
  ocppVersion?: MaybeRef<OCPPVersion | undefined>
  options?: {
    onCleanup?: () => void
    onError?: (error: unknown, step?: 'authorize' | 'startTransaction') => void
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
  pending: Readonly<Ref<boolean>>
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

  const pending = ref(false)

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
    if (pending.value) return false
    pending.value = true
    try {
      const idTag = formState.value.idTag.length > 0 ? formState.value.idTag : undefined

      if (formState.value.authorizeIdTag) {
        if (idTag == null) {
          $toast.error('Please provide an RFID tag to authorize')
          return false
        }
        try {
          await $uiClient.authorize(hashId, idTag, toValue(ocppVersion))
        } catch (error: unknown) {
          $toast.error('Error at authorizing RFID tag')
          console.error('Error at authorizing RFID tag:', error)
          options?.onError?.(error, 'authorize')
          options?.onCleanup?.()
          return false
        }
      }

      try {
        await $uiClient.startTransaction(hashId, {
          connectorId: convertToInt(connectorId),
          evseId: toValue(evseId),
          idTag,
          ocppVersion: toValue(ocppVersion),
        })
        $toast.success('Transaction successfully started')
        return true
      } catch (error: unknown) {
        $toast.error('Error at starting transaction')
        console.error('Error at starting transaction:', error)
        options?.onError?.(error, 'startTransaction')
        return false
      } finally {
        options?.onCleanup?.()
      }
    } finally {
      pending.value = false
    }
  }

  return {
    formState,
    pending: readonly(pending),
    resetForm,
    submitForm,
  }
}
