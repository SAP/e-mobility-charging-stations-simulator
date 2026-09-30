import { type MaybeRefOrGetter, readonly, ref, type Ref, toValue } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/core/index.js'

/**
 * Stored credentials used to omit unchanged fields from URL updates.
 */
export interface SetUrlFormBaseCredentials {
  supervisionPassword?: string
  supervisionUser?: string
}

export interface SetUrlFormState {
  supervisionPassword: string
  supervisionUrl: string
  supervisionUser: string
}

/**
 * Returns form state and submission logic for setting the supervision URL.
 * @param hashId - The charging station hash identifier
 * @param chargingStationId - The charging station display identifier
 * @param baseCredentials - Stored credentials. Without a base, empty fields
 * explicitly clear the stored values.
 * @returns Form state and submit/reset functions
 */
export function useSetUrlForm (
  hashId: string,
  chargingStationId: string,
  baseCredentials?: MaybeRefOrGetter<SetUrlFormBaseCredentials | undefined>
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
   * Omit unchanged credentials to avoid rewriting inherited values. Without a
   * base value, an empty field explicitly clears the stored credential.
   * @param field - Credential field being submitted.
   * @param value - Value currently held by the form.
   * @returns The value to send, `undefined` when it equals the station base.
   */
  function credentialToSubmit (
    field: keyof SetUrlFormBaseCredentials,
    value: string
  ): string | undefined {
    const base = toValue(baseCredentials)?.[field]
    return base != null && base === value ? undefined : value
  }

  /**
   * Validates and submits the supervision URL update.
   * @returns Whether the submission was successful
   */
  async function submitForm (): Promise<boolean> {
    if (pending.value) return false
    if (formState.value.supervisionUrl.length === 0) {
      $toast.error('Supervision url is required')
      return false
    }
    const supervisionUser = credentialToSubmit('supervisionUser', formState.value.supervisionUser)
    if (supervisionUser?.includes(':') === true) {
      $toast.error('Supervision username must not contain ":"')
      return false
    }
    pending.value = true
    try {
      await $uiClient.setSupervisionUrl(
        hashId,
        formState.value.supervisionUrl,
        supervisionUser,
        credentialToSubmit('supervisionPassword', formState.value.supervisionPassword)
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
