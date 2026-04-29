/**
 * @file useStationStatus.test.ts
 * @description Tests for the useStationStatus shared composable status mapping functions.
 */
import { describe, expect, it } from 'vitest'

import { getConnectorStatusVariant } from '@/shared/composables/stationStatus.js'

const validVariants = new Set(['err', 'idle', 'ok', 'warn'])

describe('useStationStatus', () => {
  describe('getConnectorStatusVariant', () => {
    it('should return ok for Available', () => {
      const result = getConnectorStatusVariant('Available')
      expect(result).toBe('ok')
      expect(result).not.toBe('err')
    })

    it('should return ok for Charging', () => {
      const result = getConnectorStatusVariant('Charging')
      expect(result).toBe('ok')
      expect(result).not.toBe('err')
    })

    it('should return ok for Occupied', () => {
      const result = getConnectorStatusVariant('Occupied')
      expect(result).toBe('ok')
      expect(result).not.toBe('err')
    })

    it('should return warn for Preparing', () => {
      const result = getConnectorStatusVariant('Preparing')
      expect(result).toBe('warn')
      expect(result).not.toBe('ok')
    })

    it('should return warn for SuspendedEV', () => {
      const result = getConnectorStatusVariant('SuspendedEV')
      expect(result).toBe('warn')
      expect(result).not.toBe('ok')
    })

    it('should return warn for SuspendedEVSE', () => {
      const result = getConnectorStatusVariant('SuspendedEVSE')
      expect(result).toBe('warn')
      expect(result).not.toBe('ok')
    })

    it('should return warn for Finishing', () => {
      const result = getConnectorStatusVariant('Finishing')
      expect(result).toBe('warn')
      expect(result).not.toBe('ok')
    })

    it('should return err for Faulted', () => {
      const result = getConnectorStatusVariant('Faulted')
      expect(result).toBe('err')
      expect(result).not.toBe('ok')
    })

    it('should return err for Unavailable', () => {
      const result = getConnectorStatusVariant('Unavailable')
      expect(result).toBe('err')
      expect(result).not.toBe('ok')
    })

    it('should return idle for undefined', () => {
      const result = getConnectorStatusVariant(undefined)
      expect(result).toBe('idle')
      expect(result).not.toBe('ok')
    })

    it('should return idle for unknown status', () => {
      const result = getConnectorStatusVariant('Unknown')
      expect(result).toBe('idle')
      expect(result).not.toBe('ok')
    })

    it('should return only valid StatusVariant values for all known statuses', () => {
      const statuses = [
        'Available',
        'Charging',
        'Occupied',
        'Preparing',
        'SuspendedEV',
        'SuspendedEVSE',
        'Finishing',
        'Faulted',
        'Unavailable',
        undefined,
        'Unknown',
      ]
      for (const status of statuses) {
        const result = getConnectorStatusVariant(status)
        expect(validVariants.has(result)).toBe(true)
      }
      expect(statuses.length).toBe(11)
    })

    it('should handle case-insensitive status values', () => {
      expect(getConnectorStatusVariant('available')).toBe('ok')
      expect(getConnectorStatusVariant('CHARGING')).toBe('ok')
      expect(getConnectorStatusVariant('faulted')).toBe('err')
      expect(getConnectorStatusVariant('preparing')).toBe('warn')
    })
  })
})
