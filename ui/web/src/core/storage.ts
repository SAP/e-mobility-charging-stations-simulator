import { SHARED_TOGGLE_BUTTON_KEY_PREFIX, TOGGLE_BUTTON_KEY_PREFIX } from './Constants.js'

export const getFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key)
    return item != null ? (JSON.parse(item) as T) : defaultValue
  } catch {
    if (import.meta.env.DEV) {
      console.debug(`[localStorage] Failed to read key '${key}', using default`)
    }
    return defaultValue
  }
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const setToLocalStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage.setItem() can throw:
    // - QuotaExceededError when the origin's storage quota is genuinely exceeded
    // - SecurityError when storage is blocked by user settings or browser policies
    //   (e.g., "Block All Cookies" in Safari, third-party iframe in Chrome, file: URLs)
    if (import.meta.env.DEV) {
      console.debug(`[localStorage] Failed to write key '${key}'`)
    }
  }
}

export const deleteFromLocalStorage = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    if (import.meta.env.DEV) {
      console.debug(`[localStorage] Failed to delete key '${key}'`)
    }
  }
}

export const getLocalStorage = (): Storage => {
  try {
    return localStorage
  } catch {
    throw new Error('localStorage is not available')
  }
}

/**
 * Deletes all localStorage entries whose key includes the given pattern.
 * @param pattern - Substring to match against localStorage keys
 */
export const deleteLocalStorageByKeyPattern = (pattern: string): void => {
  try {
    const keysToDelete = Object.keys(localStorage).filter(key => key.includes(pattern))
    for (const key of keysToDelete) {
      deleteFromLocalStorage(key)
    }
  } catch {
    if (import.meta.env.DEV) {
      console.debug(`[localStorage] Failed to delete keys matching '${pattern}'`)
    }
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
