import type { ChargingStationData, ConfigurationData, ResponsePayload } from 'ui-common'
import type { InjectionKey, Ref } from 'vue'

import { inject, ref as vueRef } from 'vue'
import { useToast } from 'vue-toast-notification'

import { SHARED_TOGGLE_BUTTON_KEY_PREFIX, TOGGLE_BUTTON_KEY_PREFIX } from './Constants'
import { UIClient } from './UIClient'

export const configurationKey: InjectionKey<Ref<ConfigurationData>> = Symbol('configuration')
export const chargingStationsKey: InjectionKey<Ref<ChargingStationData[]>> =
  Symbol('chargingStations')
export const templatesKey: InjectionKey<Ref<string[]>> = Symbol('templates')
export const uiClientKey: InjectionKey<UIClient> = Symbol('uiClient')

export const getFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  const item = localStorage.getItem(key)
  return item != null ? (JSON.parse(item) as T) : defaultValue
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const setToLocalStorage = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value))
}

export const deleteFromLocalStorage = (key: string): void => {
  localStorage.removeItem(key)
}

export const getLocalStorage = (): Storage => {
  return localStorage
}

/**
 * Deletes all localStorage entries whose key includes the given pattern.
 * @param pattern - Substring to match against localStorage keys
 */
export const deleteLocalStorageByKeyPattern = (pattern: string): void => {
  const keysToDelete: string[] = []
  for (const key in getLocalStorage()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    deleteFromLocalStorage(key)
  }
}

/**
 * Resets the state of a toggle button by removing its entry from localStorage.
 * @param id - The identifier of the toggle button
 * @param shared - Whether the toggle button is shared
 */
export const resetToggleButtonState = (id: string, shared = false): void => {
  const key = shared
    ? `${SHARED_TOGGLE_BUTTON_KEY_PREFIX}${id}`
    : `${TOGGLE_BUTTON_KEY_PREFIX}${id}`
  deleteFromLocalStorage(key)
}

export const useUIClient = (): UIClient => {
  const injected = inject(uiClientKey, undefined)
  if (injected != null) return injected
  return UIClient.getInstance()
}

export const useConfiguration = (): Ref<ConfigurationData> => {
  const injected = inject(configurationKey, undefined)
  if (injected != null) return injected
  throw new Error('configuration not provided')
}

export const useChargingStations = (): Ref<ChargingStationData[]> => {
  const injected = inject(chargingStationsKey, undefined)
  if (injected != null) return injected
  throw new Error('chargingStations not provided')
}

export const useTemplates = (): Ref<string[]> => {
  const injected = inject(templatesKey, undefined)
  if (injected != null) return injected
  throw new Error('templates not provided')
}

export interface ExecuteActionCallbacks {
  onFinally?: () => void
  onSuccess?: () => void
}

export const useExecuteAction = (emit?: (event: 'need-refresh') => void) => {
  const $toast = useToast()
  return (
    action: Promise<unknown>,
    successMsg: string,
    errorMsg: string,
    callbacks?: (() => void) | ExecuteActionCallbacks
  ): void => {
    const { onFinally, onSuccess } =
      typeof callbacks === 'function'
        ? { onFinally: callbacks, onSuccess: undefined }
        : (callbacks ?? {})
    action
      .then(() => {
        try {
          onSuccess?.()
        } catch (error: unknown) {
          console.error('Error in onSuccess callback:', error)
        }
        emit?.('need-refresh')
        return $toast.success(successMsg)
      })
      .finally(() => {
        try {
          onFinally?.()
        } catch (error: unknown) {
          console.error('Error in onFinally callback:', error)
        }
      })
      .catch((error: unknown) => {
        $toast.error(errorMsg)
        console.error(`${errorMsg}:`, error)
      })
  }
}

export const useFetchData = (
  clientFn: () => Promise<ResponsePayload>,
  onSuccess: (response: ResponsePayload) => void,
  errorMsg: string,
  onError?: () => void
): { fetch: () => void; fetching: Ref<boolean> } => {
  const fetching = vueRef(false)
  const $toast = useToast()
  const fetch = (): void => {
    if (!fetching.value) {
      fetching.value = true
      clientFn()
        .then((response: ResponsePayload) => {
          onSuccess(response)
          return undefined
        })
        .finally(() => {
          fetching.value = false
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
    }
  }
  return { fetch, fetching }
}
