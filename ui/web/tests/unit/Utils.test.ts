/**
 * @file Tests for Utils composable
 * @description Unit tests for localStorage, toggle state, useExecuteAction, and useFetchData utilities.
 */
import { flushPromises } from '@vue/test-utils'
import { ResponseStatus } from 'ui-common'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deleteFromLocalStorage,
  getFromLocalStorage,
  getLocalStorage,
  resetToggleButtonState,
  setToLocalStorage,
  useExecuteAction,
  useFetchData,
} from '@/composables'

import { toastMock } from '../setup'

describe('Utils', () => {
  describe('localStorage utilities', () => {
    afterEach(() => {
      localStorage.clear()
    })

    it('should get value from localStorage when key exists', () => {
      const key = 'test-key'
      const value = { count: 42, name: 'test' }
      localStorage.setItem(key, JSON.stringify(value))

      const result = getFromLocalStorage(key, null)

      expect(result).toEqual(value)
    })

    it('should return default value when key does not exist', () => {
      const key = 'non-existent-key'
      const defaultValue = { name: 'default' }

      const result = getFromLocalStorage(key, defaultValue)

      expect(result).toEqual(defaultValue)
    })

    it('should set value to localStorage', () => {
      const key = 'test-key'
      const value = { count: 42, name: 'test' }

      setToLocalStorage(key, value)

      expect(localStorage.getItem(key)).toBe(JSON.stringify(value))
    })

    it('should set string value to localStorage', () => {
      const key = 'string-key'
      const value = 'test-string'

      setToLocalStorage(key, value)

      expect(localStorage.getItem(key)).toBe(JSON.stringify(value))
    })

    it('should delete value from localStorage', () => {
      const key = 'test-key'
      localStorage.setItem(key, 'test-value')

      deleteFromLocalStorage(key)

      expect(localStorage.getItem(key)).toBeNull()
    })

    it('should return localStorage instance', () => {
      const result = getLocalStorage()

      expect(result).toBe(localStorage)
    })
  })

  describe('resetToggleButtonState', () => {
    afterEach(() => {
      localStorage.clear()
    })

    it('should delete non-shared toggle button state with correct key', () => {
      const id = 'button-1'
      const key = `toggle-button-${id}`
      localStorage.setItem(key, 'true')

      resetToggleButtonState(id, false)

      expect(localStorage.getItem(key)).toBeNull()
    })

    it('should delete shared toggle button state with correct key', () => {
      const id = 'button-1'
      const key = `shared-toggle-button-${id}`
      localStorage.setItem(key, 'true')

      resetToggleButtonState(id, true)

      expect(localStorage.getItem(key)).toBeNull()
    })

    it('should use non-shared key by default', () => {
      const id = 'button-1'
      const nonSharedKey = `toggle-button-${id}`
      const sharedKey = `shared-toggle-button-${id}`
      localStorage.setItem(nonSharedKey, 'true')
      localStorage.setItem(sharedKey, 'true')

      resetToggleButtonState(id)

      expect(localStorage.getItem(nonSharedKey)).toBeNull()
      expect(localStorage.getItem(sharedKey)).toBe('true')
    })

    it('should handle deletion of non-existent key gracefully', () => {
      const id = 'non-existent'

      expect(() => {
        resetToggleButtonState(id)
      }).not.toThrow()
    })
  })

  describe('useExecuteAction', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should call emit and toast.success on action success', async () => {
      const emit = vi.fn()
      const executeAction = useExecuteAction(emit)

      executeAction(Promise.resolve(), 'Success message', 'Error message')
      await flushPromises()

      expect(emit).toHaveBeenCalledWith('need-refresh')
      expect(toastMock.success).toHaveBeenCalledWith('Success message')
    })

    it('should call toast.error and console.error on action failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const emit = vi.fn()
      const executeAction = useExecuteAction(emit)

      executeAction(Promise.reject(new Error('fail')), 'Success', 'Error at action')
      await flushPromises()

      expect(emit).not.toHaveBeenCalled()
      expect(toastMock.error).toHaveBeenCalledWith('Error at action')
      expect(consoleSpy).toHaveBeenCalledWith('Error at action:', expect.any(Error))
    })
  })

  describe('useFetchData', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should call onSuccess and reset fetching on successful fetch', async () => {
      const response = { status: ResponseStatus.SUCCESS }
      const onSuccess = vi.fn()
      const { fetch, fetching } = useFetchData(
        () => Promise.resolve(response),
        onSuccess,
        'Error message'
      )

      fetch()
      expect(fetching.value).toBe(true)
      await flushPromises()

      expect(onSuccess).toHaveBeenCalledWith(response)
      expect(fetching.value).toBe(false)
    })

    it('should call onError and toast.error on failed fetch', async () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const onError = vi.fn()
      const { fetch } = useFetchData(
        () => Promise.reject(new Error('network')),
        vi.fn(),
        'Fetch failed',
        onError
      )

      fetch()
      await flushPromises()

      expect(onError).toHaveBeenCalled()
      expect(toastMock.error).toHaveBeenCalledWith('Fetch failed')
      expect(consoleSpy).toHaveBeenCalledWith('Fetch failed:', expect.any(Error))
    })

    it('should prevent concurrent fetches via loading guard', async () => {
      let resolvePromise: ((value: unknown) => void) | undefined
      const clientFn = vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            resolvePromise = resolve
          })
      )
      const { fetch } = useFetchData(clientFn, vi.fn(), 'Error')

      fetch()
      fetch()
      fetch()

      expect(clientFn).toHaveBeenCalledTimes(1)

      if (resolvePromise !== undefined) {
        resolvePromise({ status: ResponseStatus.SUCCESS })
      }
      await flushPromises()
    })

    it('should reset fetching on error', async () => {
      const { fetch, fetching } = useFetchData(
        () => Promise.reject(new Error('fail')),
        vi.fn(),
        'Error'
      )

      fetch()
      await flushPromises()

      expect(fetching.value).toBe(false)
    })

    it('should work without onError callback', async () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const { fetch } = useFetchData(
        () => Promise.reject(new Error('fail')),
        vi.fn(),
        'Fetch error'
      )

      fetch()
      await flushPromises()

      expect(toastMock.error).toHaveBeenCalledWith('Fetch error')
      expect(consoleSpy).toHaveBeenCalled()
    })
  })
})
