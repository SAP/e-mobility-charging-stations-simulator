/**
 * @file useStationStatus.test.ts
 * @description Tests for the useStationStatus shared composable status mapping functions.
 */
import { describe, expect, it } from 'vitest'

import {
  getConnectorStatusVariant,
  getWsStatusVariant,
} from '@/shared/composables/useStationStatus.js'

const validVariants = new Set(['err', 'idle', 'ok', 'warn'])

describe('getConnectorStatusVariant', () => {
  it('returns ok for Available', () => {
    const result = getConnectorStatusVariant('Available')
    expect(result).toBe('ok')
    expect(result).not.toBe('err')
  })

  it('returns ok for Charging', () => {
    const result = getConnectorStatusVariant('Charging')
    expect(result).toBe('ok')
    expect(result).not.toBe('err')
  })

  it('returns ok for Occupied', () => {
    const result = getConnectorStatusVariant('Occupied')
    expect(result).toBe('ok')
    expect(result).not.toBe('err')
  })

  it('returns warn for Preparing', () => {
    const result = getConnectorStatusVariant('Preparing')
    expect(result).toBe('warn')
    expect(result).not.toBe('ok')
  })

  it('returns warn for SuspendedEV', () => {
    const result = getConnectorStatusVariant('SuspendedEV')
    expect(result).toBe('warn')
    expect(result).not.toBe('ok')
  })

  it('returns warn for SuspendedEVSE', () => {
    const result = getConnectorStatusVariant('SuspendedEVSE')
    expect(result).toBe('warn')
    expect(result).not.toBe('ok')
  })

  it('returns warn for Finishing', () => {
    const result = getConnectorStatusVariant('Finishing')
    expect(result).toBe('warn')
    expect(result).not.toBe('ok')
  })

  it('returns err for Faulted', () => {
    const result = getConnectorStatusVariant('Faulted')
    expect(result).toBe('err')
    expect(result).not.toBe('ok')
  })

  it('returns err for Unavailable', () => {
    const result = getConnectorStatusVariant('Unavailable')
    expect(result).toBe('err')
    expect(result).not.toBe('ok')
  })

  it('returns idle for undefined', () => {
    const result = getConnectorStatusVariant(undefined)
    expect(result).toBe('idle')
    expect(result).not.toBe('ok')
  })

  it('returns idle for unknown status', () => {
    const result = getConnectorStatusVariant('Unknown')
    expect(result).toBe('idle')
    expect(result).not.toBe('ok')
  })

  it('returns only valid StatusVariant values for all known statuses', () => {
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
})

describe('getWsStatusVariant', () => {
  it('returns idle when not started', () => {
    expect(getWsStatusVariant(false, false)).toBe('idle')
    expect(getWsStatusVariant(false, true)).toBe('idle')
  })

  it('returns ok when started and connected', () => {
    const result = getWsStatusVariant(true, true)
    expect(result).toBe('ok')
    expect(validVariants.has(result)).toBe(true)
  })

  it('returns err when started but not connected', () => {
    const result = getWsStatusVariant(true, false)
    expect(result).toBe('err')
    expect(result).not.toBe('ok')
  })
})
