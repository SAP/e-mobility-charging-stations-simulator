import type { ResponsePayload } from 'ui-common'
import type { Ref } from 'vue'

import { ref as vueRef } from 'vue'
import { useToast } from 'vue-toast-notification'

export const useFetchData = (
  clientFn: () => Promise<ResponsePayload>,
  onSuccess: (response: ResponsePayload) => void,
  errorMsg: string,
  onError?: () => void
): { fetch: () => void; fetching: Ref<boolean> } => {
  const fetching = vueRef(false)
  const $toast = useToast()
  const fetch = (): void => {
    if (fetching.value) {
      return
    }
    fetching.value = true
    // eslint-disable-next-line promise/catch-or-return -- .catch() is present; .finally() at end is idiomatic
    clientFn()
      .then((response: ResponsePayload) => {
        onSuccess(response)
        return undefined
      })
      .catch((error: unknown) => {
        try {
          onError?.()
        } catch (callbackError: unknown) {
          console.error('Error in onError callback:', callbackError)
        }
        $toast.error(errorMsg)
        console.error(`${errorMsg}:`, error)
      })
      .finally(() => {
        fetching.value = false
      })
  }
  return { fetch, fetching }
}
