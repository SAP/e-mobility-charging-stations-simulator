import type { ChargingStationData, ConfigurationData } from 'ui-common'
import type { InjectionKey, Ref } from 'vue'

import { randomUUID, validateUUID } from 'ui-common'
import { inject } from 'vue'
import { useToast } from 'vue-toast-notification'

import {
  EMPTY_VALUE_PLACEHOLDER,
  SHARED_TOGGLE_BUTTON_KEY_PREFIX,
  TOGGLE_BUTTON_KEY_PREFIX,
} from './Constants'
import { UIClient } from './UIClient'

export const configurationKey: InjectionKey<Ref<ConfigurationData>> = Symbol('configuration')
export const chargingStationsKey: InjectionKey<Ref<ChargingStationData[]>> =
  Symbol('chargingStations')
export const templatesKey: InjectionKey<Ref<string[]>> = Symbol('templates')
export const uiClientKey: InjectionKey<UIClient> = Symbol('uiClient')

export const convertToBoolean = (value: unknown): boolean => {
  let result = false
  if (value != null) {
    // Check the type
    if (typeof value === 'boolean') {
      return value
    } else if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      result = normalized === 'true' || normalized === '1'
    } else if (typeof value === 'number' && value === 1) {
      result = true
    }
  }
  return result
}

export const convertToInt = (value: unknown): number => {
  if (value == null) {
    return 0
  }
  if (Number.isSafeInteger(value)) {
    return value as number
  }
  if (typeof value === 'number') {
    return Math.trunc(value)
  }
  let changedValue: number = value as number
  if (typeof value === 'string') {
    changedValue = Number.parseInt(value)
  }
  if (Number.isNaN(changedValue)) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    throw new Error(`Cannot convert to integer: '${value.toString()}'`)
  }
  return changedValue
}

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
 * Returns a human-readable name for a WebSocket ready state.
 * @param state - The WebSocket readyState value
 * @returns The state name or EMPTY_VALUE_PLACEHOLDER for unknown/undefined states
 */
export const getWebSocketStateName = (state: number | undefined): string => {
  switch (state) {
    case WebSocket.CLOSED:
      return 'Closed'
    case WebSocket.CLOSING:
      return 'Closing'
    case WebSocket.CONNECTING:
      return 'Connecting'
    case WebSocket.OPEN:
      return 'Open'
    default:
      return EMPTY_VALUE_PLACEHOLDER
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

export { randomUUID, validateUUID }

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

export const useExecuteAction = (emit?: (event: 'need-refresh') => void) => {
  const $toast = useToast()
  return (
    action: Promise<unknown>,
    successMsg: string,
    errorMsg: string,
    onFinally?: () => void
  ): void => {
    action
      .then(() => {
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
