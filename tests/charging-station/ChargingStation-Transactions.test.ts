/**
 * @file Tests for ChargingStation Transaction Management
 * @description Unit tests for transaction queries, energy meters, and concurrent transaction handling
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { withMockTimers } from '../helpers/TestLifecycleHelpers.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

await describe('ChargingStation Transaction Management', async () => {
  await describe('Transaction Query Tests', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should return undefined for getConnectorIdByTransactionId with no active transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const connectorId = station.getConnectorIdByTransactionId(12345)

      // Assert
      expect(connectorId).toBeUndefined()
    })

    await it('should return connector id for getConnectorIdByTransactionId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionIdTag = 'TEST-TAG-001'
      }

      // Act
      const connectorId = station.getConnectorIdByTransactionId(100)

      // Assert
      expect(connectorId).toBe(1)
    })

    await it('should return undefined for getConnectorIdByTransactionId with undefined transactionId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const connectorId = station.getConnectorIdByTransactionId(undefined)

      // Assert
      expect(connectorId).toBeUndefined()
    })

    await it('should return undefined for getEvseIdByTransactionId in non-EVSE mode', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 0 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }

      // Act
      const evseId = station.getEvseIdByTransactionId(100)

      // Assert
      expect(evseId).toBeUndefined()
    })

    await it('should return EVSE id for getEvseIdByTransactionId in EVSE mode with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 2 })
      station = result.station
      // Get connector in EVSE 1
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 200
        connector1.transactionIdTag = 'TEST-TAG-002'
      }

      // Act
      const evseId = station.getEvseIdByTransactionId(200)

      // Assert
      expect(evseId).toBe(1)
    })

    await it('should return idTag for getTransactionIdTag with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 300
        connector1.transactionIdTag = 'MY-TAG-123'
      }

      // Act
      const idTag = station.getTransactionIdTag(300)

      // Assert
      expect(idTag).toBe('MY-TAG-123')
    })

    await it('should return undefined for getTransactionIdTag with no matching transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const idTag = station.getTransactionIdTag(999)

      // Assert
      expect(idTag).toBeUndefined()
    })

    await it('should return zero for getNumberOfRunningTransactions with no transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert
      expect(count).toBe(0)
    })

    await it('should return correct count for getNumberOfRunningTransactions with active transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station
      // Set up transactions on connectors 1 and 2
      const connector1 = station.getConnectorStatus(1)
      const connector2 = station.getConnectorStatus(2)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }
      if (connector2 != null) {
        connector2.transactionStarted = true
        connector2.transactionId = 101
      }

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert
      expect(count).toBe(2)
    })
  })

  await describe('Energy Meter Tests', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should return 0 for getEnergyActiveImportRegisterByConnectorId with no transaction energy', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(1)

      // Assert
      expect(energy).toBe(0)
    })

    await it('should return energy value for getEnergyActiveImportRegisterByConnectorId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionEnergyActiveImportRegisterValue = 12500
      }

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(1)

      // Assert
      expect(energy).toBe(12500)
    })

    await it('should return rounded energy value when rounded=true', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionEnergyActiveImportRegisterValue = 12345.678
      }

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(1, true)

      // Assert
      expect(energy).toBe(12346)
    })

    await it('should return 0 for getEnergyActiveImportRegisterByConnectorId with invalid connector', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(99)

      // Assert
      expect(energy).toBe(0)
    })

    await it('should return 0 for getEnergyActiveImportRegisterByTransactionId with no matching transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByTransactionId(999)

      // Assert
      expect(energy).toBe(0)
    })

    await it('should return energy for getEnergyActiveImportRegisterByTransactionId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 400
        connector1.transactionEnergyActiveImportRegisterValue = 25000
      }

      // Act
      const energy = station.getEnergyActiveImportRegisterByTransactionId(400)

      // Assert
      expect(energy).toBe(25000)
    })
  })

  await describe('Concurrent Transaction Scenarios', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should handle multiple transactions on different connectors', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Set up transactions on connectors 1, 2, and 3
      const connector1 = station.getConnectorStatus(1)
      const connector2 = station.getConnectorStatus(2)
      const connector3 = station.getConnectorStatus(3)

      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionIdTag = 'TAG-A'
        connector1.transactionEnergyActiveImportRegisterValue = 10000
      }
      if (connector2 != null) {
        connector2.transactionStarted = true
        connector2.transactionId = 101
        connector2.transactionIdTag = 'TAG-B'
        connector2.transactionEnergyActiveImportRegisterValue = 20000
      }
      if (connector3 != null) {
        connector3.transactionStarted = true
        connector3.transactionId = 102
        connector3.transactionIdTag = 'TAG-C'
        connector3.transactionEnergyActiveImportRegisterValue = 30000
      }

      // Act & Assert - Running transactions count
      expect(station.getNumberOfRunningTransactions()).toBe(3)

      // Act & Assert - Transaction queries
      expect(station.getConnectorIdByTransactionId(100)).toBe(1)
      expect(station.getConnectorIdByTransactionId(101)).toBe(2)
      expect(station.getConnectorIdByTransactionId(102)).toBe(3)

      // Act & Assert - Energy meters
      expect(station.getEnergyActiveImportRegisterByTransactionId(100)).toBe(10000)
      expect(station.getEnergyActiveImportRegisterByTransactionId(101)).toBe(20000)
      expect(station.getEnergyActiveImportRegisterByTransactionId(102)).toBe(30000)

      // Act & Assert - Id tags
      expect(station.getTransactionIdTag(100)).toBe('TAG-A')
      expect(station.getTransactionIdTag(101)).toBe('TAG-B')
      expect(station.getTransactionIdTag(102)).toBe('TAG-C')
    })

    await it('should handle transactions across multiple EVSEs', () => {
      // Arrange - 4 connectors across 2 EVSEs
      const result = createMockChargingStation({ connectorsCount: 4, evsesCount: 2 })
      station = result.station

      // Set up transaction on connector 1 (EVSE 1) and connector 3 (EVSE 2)
      const connector1 = station.getConnectorStatus(1)
      const connector3 = station.getConnectorStatus(3)

      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 500
        connector1.transactionIdTag = 'EVSE1-TAG'
        connector1.transactionEnergyActiveImportRegisterValue = 15000
      }
      if (connector3 != null) {
        connector3.transactionStarted = true
        connector3.transactionId = 501
        connector3.transactionIdTag = 'EVSE2-TAG'
        connector3.transactionEnergyActiveImportRegisterValue = 18000
      }

      // Act & Assert - Running transactions count
      expect(station.getNumberOfRunningTransactions()).toBe(2)

      // Act & Assert - EVSE queries
      expect(station.getEvseIdByTransactionId(500)).toBe(1)
      expect(station.getEvseIdByTransactionId(501)).toBe(2)

      // Act & Assert - Connector queries
      expect(station.getConnectorIdByTransactionId(500)).toBe(1)
      expect(station.getConnectorIdByTransactionId(501)).toBe(3)

      // Act & Assert - Energy meters
      expect(station.getEnergyActiveImportRegisterByTransactionId(500)).toBe(15000)
      expect(station.getEnergyActiveImportRegisterByTransactionId(501)).toBe(18000)
    })

    await it('should correctly count transactions only on connectors > 0', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Connector 0 should not count (station-level)
      const connector0 = station.getConnectorStatus(0)
      const connector1 = station.getConnectorStatus(1)

      if (connector0 != null) {
        // This shouldn't happen in real usage but test robustness
        connector0.transactionStarted = true
        connector0.transactionId = 999
      }
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert - Only connector 1 should count
      expect(count).toBe(1)
    })

    await it('should return idTag in EVSE mode for getTransactionIdTag', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2, evsesCount: 2 })
      station = result.station

      const connector2 = station.getConnectorStatus(2)
      if (connector2 != null) {
        connector2.transactionStarted = true
        connector2.transactionId = 600
        connector2.transactionIdTag = 'EVSE-MODE-TAG'
      }

      // Act
      const idTag = station.getTransactionIdTag(600)

      // Assert
      expect(idTag).toBe('EVSE-MODE-TAG')
    })

    await it('should handle rounded energy values for getEnergyActiveImportRegisterByTransactionId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 700
        connector1.transactionEnergyActiveImportRegisterValue = 12345.5
      }

      // Act
      const unrounded = station.getEnergyActiveImportRegisterByTransactionId(700, false)
      const rounded = station.getEnergyActiveImportRegisterByTransactionId(700, true)

      // Assert
      expect(unrounded).toBe(12345.5)
      expect(rounded).toBe(12346)
    })
  })

  await describe('Heartbeat and Meter Intervals', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should create interval when startHeartbeat() is called with valid interval', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 1, heartbeatInterval: 30000 })
        station = result.station

        // Act
        station.startHeartbeat()

        // Assert - heartbeat interval should be created
        expect(station.heartbeatSetInterval).toBeDefined()
        expect(typeof station.heartbeatSetInterval).toBe('object')
      })
    })

    await it('should restart heartbeat interval when restartHeartbeat() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 1, heartbeatInterval: 30000 })
        station = result.station
        station.startHeartbeat()
        const firstInterval = station.heartbeatSetInterval

        // Act
        station.restartHeartbeat()
        const secondInterval = station.heartbeatSetInterval

        // Assert - interval should be different (old cleared, new created)
        expect(secondInterval).toBeDefined()
        expect(typeof secondInterval).toBe('object')
        expect(firstInterval !== secondInterval).toBe(true)
      })
    })

    await it('should not create heartbeat interval if already started', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 1, heartbeatInterval: 30000 })
        station = result.station
        station.startHeartbeat()
        const firstInterval = station.heartbeatSetInterval

        // Act - call startHeartbeat again
        station.startHeartbeat()
        const secondInterval = station.heartbeatSetInterval

        // Assert - interval should be same (not restarted)
        expect(firstInterval).toBe(secondInterval)
      })
    })

    await it('should create meter values interval when startMeterValues() is called for active transaction', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 2 })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }

        // Act
        station.startMeterValues(1, 10000)

        // Assert - meter values interval should be created
        if (connector1 != null) {
          expect(connector1.transactionSetInterval).toBeDefined()
          expect(typeof connector1.transactionSetInterval).toBe('object')
        }
      })
    })

    await it('should restart meter values interval when restartMeterValues() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 2 })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }
        station.startMeterValues(1, 10000)
        const firstInterval = connector1?.transactionSetInterval

        // Act
        station.restartMeterValues(1, 15000)
        const secondInterval = connector1?.transactionSetInterval

        // Assert - interval should be different
        expect(secondInterval).toBeDefined()
        expect(typeof secondInterval).toBe('object')
        expect(firstInterval !== secondInterval).toBe(true)
      })
    })

    await it('should clear meter values interval when stopMeterValues() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 2 })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }
        station.startMeterValues(1, 10000)

        // Act
        station.stopMeterValues(1)

        // Assert - interval should be cleared
        expect(connector1?.transactionSetInterval).toBeUndefined()
      })
    })

    await it('should create transaction updated interval when startTxUpdatedInterval() is called for OCPP 2.0', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 2, ocppVersion: '2.0' })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }

        // Act
        station.startTxUpdatedInterval(1, 5000)

        // Assert - transaction updated interval should be created
        if (connector1 != null) {
          expect(connector1.transactionTxUpdatedSetInterval).toBeDefined()
          expect(typeof connector1.transactionTxUpdatedSetInterval).toBe('object')
        }
      })
    })

    await it('should clear transaction updated interval when stopTxUpdatedInterval() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({ connectorsCount: 2, ocppVersion: '2.0' })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }
        station.startTxUpdatedInterval(1, 5000)

        // Act
        station.stopTxUpdatedInterval(1)

        // Assert - interval should be cleared
        expect(connector1?.transactionTxUpdatedSetInterval).toBeUndefined()
      })
    })
  })
})
