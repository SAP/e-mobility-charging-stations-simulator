/**
 * @file useStationStatus.test.ts
 * @description Tests for the useStationStatus shared composable status mapping functions.
 */
import { describe, expect, it } from 'vitest'

import {
  getConnectorStatusVariant,
  getWsStatusVariant,
} from '@/shared/composables/useStationStatus.js'

describe('getConnectorStatusVariant', () => {
  it('returns ok for Available', () => {
    expect(getConnectorStatusVariant('Available')).toBe('ok')
  })

  it('returns ok for Charging', () => {
    expect(getConnectorStatusVariant('Charging')).toBe('ok')
  })

  it('returns ok for Occupied', () => {
    expect(getConnectorStatusVariant('Occupied')).toBe('ok')
  })

  it('returns warn for Preparing', () => {
    expect(getConnectorStatusVariant('Preparing')).toBe('warn')
  })

  it('returns warn for SuspendedEV', () => {
    expect(getConnectorStatusVariant('SuspendedEV')).toBe('warn')
  })

  it('returns warn for SuspendedEVSE', () => {
    expect(getConnectorStatusVariant('SuspendedEVSE')).toBe('warn')
  })

  it('returns warn for Finishing', () => {
    expect(getConnectorStatusVariant('Finishing')).toBe('warn')
  })

  it('returns err for Faulted', () => {
    expect(getConnectorStatusVariant('Faulted')).toBe('err')
  })

  it('returns err for Unavailable', () => {
    expect(getConnectorStatusVariant('Unavailable')).toBe('err')
  })

  it('returns idle for undefined', () => {
    expect(getConnectorStatusVariant(undefined)).toBe('idle')
  })

  it('returns idle for unknown status', () => {
    expect(getConnectorStatusVariant('Unknown')).toBe('idle')
  })
})

describe('getWsStatusVariant', () => {
  it('returns idle when not started', () => {
    expect(getWsStatusVariant(false, false)).toBe('idle')
    expect(getWsStatusVariant(false, true)).toBe('idle')
  })

  it('returns ok when started and connected', () => {
    expect(getWsStatusVariant(true, true)).toBe('ok')
  })

  it('returns err when started but not connected', () => {
    expect(getWsStatusVariant(true, false)).toBe('err')
  })
})
