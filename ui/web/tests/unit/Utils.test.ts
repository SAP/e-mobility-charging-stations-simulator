/**
 * @file Tests for Utils composable
 * @description Unit tests for type conversion, localStorage, UUID, and toggle state utilities.
 */
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  convertToBoolean,
  convertToInt,
  deleteFromLocalStorage,
  getFromLocalStorage,
  getLocalStorage,
  randomUUID,
  resetToggleButtonState,
  setToLocalStorage,
  useExecuteAction,
  validateUUID,
} from '@/composables/Utils'

import { toastMock } from '../setup'

describe('Utils', () => {
  describe('convertToBoolean', () => {
    it('should return true for boolean true', () => {
      expect(convertToBoolean(true)).toBe(true)
    })

    it('should return false for boolean false', () => {
      expect(convertToBoolean(false)).toBe(false)
    })

    it('should return true for string "true"', () => {
      expect(convertToBoolean('true')).toBe(true)
    })

    it('should return true for string "True" (case-insensitive)', () => {
      expect(convertToBoolean('True')).toBe(true)
    })

    it('should return true for string "TRUE" (case-insensitive)', () => {
      expect(convertToBoolean('TRUE')).toBe(true)
    })

    it('should return false for string "FALSE" (case-insensitive)', () => {
      expect(convertToBoolean('FALSE')).toBe(false)
    })

    it('should return true for string "1"', () => {
      expect(convertToBoolean('1')).toBe(true)
    })

    it('should return true for numeric 1', () => {
      expect(convertToBoolean(1)).toBe(true)
    })

    it('should return false for string "false"', () => {
      expect(convertToBoolean('false')).toBe(false)
    })

    it('should return false for string "0"', () => {
      expect(convertToBoolean('0')).toBe(false)
    })

    it('should return false for numeric 0', () => {
      expect(convertToBoolean(0)).toBe(false)
    })

    it('should return false for null', () => {
      expect(convertToBoolean(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(convertToBoolean(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(convertToBoolean('')).toBe(false)
    })

    it('should return false for arbitrary string', () => {
      expect(convertToBoolean('random')).toBe(false)
    })

    it('should return false for numeric 2', () => {
      expect(convertToBoolean(2)).toBe(false)
    })

    it('should return true for whitespace-padded "true"', () => {
      expect(convertToBoolean(' true ')).toBe(true)
    })

    it('should return true for whitespace-padded "1"', () => {
      expect(convertToBoolean(' 1 ')).toBe(true)
    })

    it('should return false for whitespace-padded "false"', () => {
      expect(convertToBoolean(' false ')).toBe(false)
    })

    it('should return true for whitespace-padded "TRUE"', () => {
      expect(convertToBoolean(' TRUE ')).toBe(true)
    })
  })

  describe('convertToInt', () => {
    it('should return integer for integer input', () => {
      expect(convertToInt(42)).toBe(42)
    })

    it('should truncate float to integer', () => {
      expect(convertToInt(42.7)).toBe(42)
    })

    it('should truncate negative float to integer', () => {
      expect(convertToInt(-42.7)).toBe(-42)
    })

    it('should parse string integer', () => {
      expect(convertToInt('42')).toBe(42)
    })

    it('should parse negative string integer', () => {
      expect(convertToInt('-42')).toBe(-42)
    })

    it('should return 0 for null', () => {
      expect(convertToInt(null)).toBe(0)
    })

    it('should return 0 for undefined', () => {
      expect(convertToInt(undefined)).toBe(0)
    })

    it('should throw error for non-numeric string', () => {
      expect(() => convertToInt('abc')).toThrow(Error)
      expect(() => convertToInt('abc')).toThrow("Cannot convert to integer: 'abc'")
    })

    it('should throw error for empty string', () => {
      expect(() => convertToInt('')).toThrow(Error)
    })

    it('should return NaN for NaN input', () => {
      const result = convertToInt(Number.NaN)
      expect(Number.isNaN(result)).toBe(true)
    })
  })

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

  describe('UUID', () => {
    it('should generate valid UUID v4', () => {
      const uuid = randomUUID()

      expect(validateUUID(uuid)).toBe(true)
    })

    it('should generate different UUIDs on each call', () => {
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()

      expect(uuid1).not.toBe(uuid2)
    })

    it('should validate correct UUID v4 format', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000'

      const result = validateUUID(validUUID)

      expect(result).toBe(true)
    })

    it('should reject non-string UUID', () => {
      const result = validateUUID(123)

      expect(result).toBe(false)
    })

    it('should reject invalid UUID format', () => {
      const result = validateUUID('not-a-uuid')

      expect(result).toBe(false)
    })

    it('should reject UUID with wrong version (v3 instead of v4)', () => {
      const v3UUID = '550e8400-e29b-31d4-a716-446655440000'

      const result = validateUUID(v3UUID)

      expect(result).toBe(false)
    })

    it('should reject UUID with invalid variant', () => {
      const invalidVariantUUID = '550e8400-e29b-41d4-c716-446655440000'

      const result = validateUUID(invalidVariantUUID)

      expect(result).toBe(false)
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
})
