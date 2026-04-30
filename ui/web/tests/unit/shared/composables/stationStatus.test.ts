/**
 * @file Tests for stationStatus utilities
 * @description Tests for the useStationStatus shared composable status mapping functions.
 */
import type { ChargingStationData } from 'ui-common'

import { OCPP16ChargePointStatus } from 'ui-common'
import { describe, expect, it } from 'vitest'

import {
  getATGStatus,
  getConnectorEntries,
  getConnectorStatusVariant,
  getWebSocketStateVariant,
} from '@/shared/utils/stationStatus.js'

describe('stationStatus', () => {
  describe('getConnectorStatusVariant', () => {
    it('should return ok for Available', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.AVAILABLE)
      expect(result).toBe('ok')
    })

    it('should return warn for Charging', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.CHARGING)
      expect(result).toBe('warn')
    })

    it('should return warn for Occupied', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.OCCUPIED)
      expect(result).toBe('warn')
    })

    it('should return warn for Preparing', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.PREPARING)
      expect(result).toBe('warn')
    })

    it('should return warn for SuspendedEV', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.SUSPENDED_EV)
      expect(result).toBe('warn')
    })

    it('should return warn for SuspendedEVSE', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.SUSPENDED_EVSE)
      expect(result).toBe('warn')
    })

    it('should return warn for Finishing', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.FINISHING)
      expect(result).toBe('warn')
    })

    it('should return err for Faulted', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.FAULTED)
      expect(result).toBe('err')
    })

    it('should return err for Unavailable', () => {
      const result = getConnectorStatusVariant(OCPP16ChargePointStatus.UNAVAILABLE)
      expect(result).toBe('err')
    })

    it('should return idle for undefined', () => {
      const result = getConnectorStatusVariant(undefined)
      expect(result).toBe('idle')
    })

    it('should return idle for unknown status', () => {
      const result = getConnectorStatusVariant('Unknown')
      expect(result).toBe('idle')
    })

    it('should handle case-insensitive status values', () => {
      expect(getConnectorStatusVariant('available')).toBe('ok')
      expect(getConnectorStatusVariant('CHARGING')).toBe('warn')
      expect(getConnectorStatusVariant('faulted')).toBe('err')
      expect(getConnectorStatusVariant('preparing')).toBe('warn')
    })
  })

  describe('getWebSocketStateVariant', () => {
    it('should return warn for CONNECTING (0)', () => {
      expect(getWebSocketStateVariant(0)).toBe('warn')
    })

    it('should return ok for OPEN (1)', () => {
      expect(getWebSocketStateVariant(1)).toBe('ok')
    })

    it('should return warn for CLOSING (2)', () => {
      expect(getWebSocketStateVariant(2)).toBe('warn')
    })

    it('should return err for CLOSED (3)', () => {
      expect(getWebSocketStateVariant(3)).toBe('err')
    })

    it('should return idle for undefined', () => {
      expect(getWebSocketStateVariant(undefined)).toBe('idle')
    })
  })

  describe('getATGStatus', () => {
    it('should return status for matching connectorId', () => {
      const station = {
        automaticTransactionGenerator: {
          automaticTransactionGeneratorStatuses: [
            { connectorId: 1, status: 'started' },
            { connectorId: 2, status: 'stopped' },
          ],
        },
      } as unknown as ChargingStationData
      expect(getATGStatus(station, 1)).toBe('started')
    })

    it('should return undefined when connectorId not found', () => {
      const station = {
        automaticTransactionGenerator: {
          automaticTransactionGeneratorStatuses: [{ connectorId: 1, status: 'started' }],
        },
      } as unknown as ChargingStationData
      expect(getATGStatus(station, 99)).toBeUndefined()
    })

    it('should return undefined when automaticTransactionGenerator is absent', () => {
      const station = {} as unknown as ChargingStationData
      expect(getATGStatus(station, 1)).toBeUndefined()
    })
  })

  describe('getConnectorEntries', () => {
    it('should return connector entries from connectors array', () => {
      const station = {
        connectors: [
          { connectorId: 0, connectorStatus: OCPP16ChargePointStatus.AVAILABLE },
          { connectorId: 1, connectorStatus: OCPP16ChargePointStatus.CHARGING },
          { connectorId: 2, connectorStatus: OCPP16ChargePointStatus.AVAILABLE },
        ],
      } as unknown as ChargingStationData
      const entries = getConnectorEntries(station)
      expect(entries).toHaveLength(2)
      expect(entries[0].connectorId).toBe(1)
      expect(entries[1].connectorId).toBe(2)
    })

    it('should return connector entries from evses, skipping evseId 0 and connectorId 0', () => {
      const station = {
        evses: [
          {
            evseId: 0,
            evseStatus: {
              connectors: [{ connectorId: 1, connectorStatus: OCPP16ChargePointStatus.AVAILABLE }],
            },
          },
          {
            evseId: 1,
            evseStatus: {
              connectors: [
                { connectorId: 0, connectorStatus: OCPP16ChargePointStatus.AVAILABLE },
                { connectorId: 1, connectorStatus: OCPP16ChargePointStatus.CHARGING },
              ],
            },
          },
        ],
      } as unknown as ChargingStationData
      const entries = getConnectorEntries(station)
      expect(entries).toHaveLength(1)
      expect(entries[0].connectorId).toBe(1)
      expect(entries[0].evseId).toBe(1)
    })

    it('should fall back to connectors when evses is empty', () => {
      const station = {
        connectors: [{ connectorId: 1, connectorStatus: OCPP16ChargePointStatus.AVAILABLE }],
        evses: [],
      } as unknown as ChargingStationData
      const entries = getConnectorEntries(station)
      expect(entries).toHaveLength(1)
    })
  })
})
