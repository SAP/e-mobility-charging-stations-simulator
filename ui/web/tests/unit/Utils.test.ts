/**
 * @file Tests for Utils composable
 * @description Unit tests for type conversion, localStorage, UUID, and toggle state utilities.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  convertToBoolean,
  convertToInt,
  deleteFromLocalStorage,
  getFromLocalStorage,
  getLocalStorage,
  randomUUID,
  resetToggleButtonState,
  setToLocalStorage,
  validateUUID,
} from '@/composables/Utils'

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
      window.localStorage.clear()
    })

    it('should get value from localStorage when key exists', () => {
      // Arrange
      const key = 'test-key'
      const value = { count: 42, name: 'test' }
      window.localStorage.setItem(key, JSON.stringify(value))

      // Act
      const result = getFromLocalStorage(key, null)

      // Assert
      expect(result).toEqual(value)
    })

    it('should return default value when key does not exist', () => {
      // Arrange
      const key = 'non-existent-key'
      const defaultValue = { name: 'default' }

      // Act
      const result = getFromLocalStorage(key, defaultValue)

      // Assert
      expect(result).toEqual(defaultValue)
    })

    it('should set value to localStorage', () => {
      // Arrange
      const key = 'test-key'
      const value = { count: 42, name: 'test' }

      // Act
      setToLocalStorage(key, value)

      // Assert
      expect(window.localStorage.getItem(key)).toBe(JSON.stringify(value))
    })

    it('should set string value to localStorage', () => {
      // Arrange
      const key = 'string-key'
      const value = 'test-string'

      // Act
      setToLocalStorage(key, value)

      // Assert
      expect(window.localStorage.getItem(key)).toBe(JSON.stringify(value))
    })

    it('should delete value from localStorage', () => {
      // Arrange
      const key = 'test-key'
      window.localStorage.setItem(key, 'test-value')

      // Act
      deleteFromLocalStorage(key)

      // Assert
      expect(window.localStorage.getItem(key)).toBeNull()
    })

    it('should return localStorage instance', () => {
      // Act
      const result = getLocalStorage()

      // Assert
      expect(result).toBe(localStorage)
    })
  })

  describe('UUID', () => {
    it('should generate valid UUID v4', () => {
      // Act
      const uuid = randomUUID()

      // Assert
      expect(validateUUID(uuid)).toBe(true)
    })

    it('should generate different UUIDs on each call', () => {
      // Act
      const uuid1 = randomUUID()
      const uuid2 = randomUUID()

      // Assert
      expect(uuid1).not.toBe(uuid2)
    })

    it('should validate correct UUID v4 format', () => {
      // Arrange
      const validUUID = '550e8400-e29b-41d4-a716-446655440000'

      // Act
      const result = validateUUID(validUUID)

      // Assert
      expect(result).toBe(true)
    })

    it('should reject non-string UUID', () => {
      // Act
      const result = validateUUID(123)

      // Assert
      expect(result).toBe(false)
    })

    it('should reject invalid UUID format', () => {
      // Act
      const result = validateUUID('not-a-uuid')

      // Assert
      expect(result).toBe(false)
    })

    it('should reject UUID with wrong version (v3 instead of v4)', () => {
      // Arrange
      const v3UUID = '550e8400-e29b-31d4-a716-446655440000'

      // Act
      const result = validateUUID(v3UUID)

      // Assert
      expect(result).toBe(false)
    })

    it('should reject UUID with invalid variant', () => {
      // Arrange
      const invalidVariantUUID = '550e8400-e29b-41d4-c716-446655440000'

      // Act
      const result = validateUUID(invalidVariantUUID)

      // Assert
      expect(result).toBe(false)
    })
  })

  describe('resetToggleButtonState', () => {
    afterEach(() => {
      window.localStorage.clear()
    })

    it('should delete non-shared toggle button state with correct key', () => {
      // Arrange
      const id = 'button-1'
      const key = `toggle-button-${id}`
      window.localStorage.setItem(key, 'true')

      // Act
      resetToggleButtonState(id, false)

      // Assert
      expect(window.localStorage.getItem(key)).toBeNull()
    })

    it('should delete shared toggle button state with correct key', () => {
      // Arrange
      const id = 'button-1'
      const key = `shared-toggle-button-${id}`
      window.localStorage.setItem(key, 'true')

      // Act
      resetToggleButtonState(id, true)

      // Assert
      expect(window.localStorage.getItem(key)).toBeNull()
    })

    it('should use non-shared key by default', () => {
      // Arrange
      const id = 'button-1'
      const nonSharedKey = `toggle-button-${id}`
      const sharedKey = `shared-toggle-button-${id}`
      window.localStorage.setItem(nonSharedKey, 'true')
      window.localStorage.setItem(sharedKey, 'true')

      // Act
      resetToggleButtonState(id)

      // Assert
      expect(window.localStorage.getItem(nonSharedKey)).toBeNull()
      expect(window.localStorage.getItem(sharedKey)).toBe('true')
    })

    it('should handle deletion of non-existent key gracefully', () => {
      // Arrange
      const id = 'non-existent'

      // Act & Assert
      expect(() => {
        resetToggleButtonState(id)
      }).not.toThrow()
    })
  })
})
