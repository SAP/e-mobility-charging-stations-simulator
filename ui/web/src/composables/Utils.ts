import type { Ref } from 'vue'

import { getCurrentInstance } from 'vue'
import { useToast } from 'vue-toast-notification'

import type { ChargingStationData, UUIDv4 } from '@/types'

import { UIClient } from './UIClient'

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
 * Resets the state of a toggle button by removing its entry from localStorage.
 * @param id - The identifier of the toggle button
 * @param shared - Whether the toggle button is shared
 */
export const resetToggleButtonState = (id: string, shared = false): void => {
  const key = shared ? `shared-toggle-button-${id}` : `toggle-button-${id}`
  deleteFromLocalStorage(key)
}

export const randomUUID = (): UUIDv4 => {
  return crypto.randomUUID()
}

export const validateUUID = (uuid: unknown): uuid is UUIDv4 => {
  if (typeof uuid !== 'string') {
    return false
  }
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    uuid
  )
}

export const useUIClient = (): UIClient => {
  return UIClient.getInstance()
}

export const useChargingStations = (): Ref<ChargingStationData[]> | undefined => {
  return getCurrentInstance()?.appContext.config.globalProperties.$chargingStations
}

export const refreshChargingStations = async (): Promise<void> => {
  const ref = useChargingStations()
  if (ref == null) return
  const response = await useUIClient().listChargingStations()
  ref.value = response.chargingStations as ChargingStationData[]
}

export const useExecuteAction = (emit: (event: 'need-refresh') => void) => {
  const $toast = useToast()
  return (action: Promise<unknown>, successMsg: string, errorMsg: string): void => {
    action
      .then(() => {
        emit('need-refresh')
        return $toast.success(successMsg)
      })
      .catch((error: unknown) => {
        $toast.error(errorMsg)
        console.error(`${errorMsg}:`, error)
      })
  }
}
