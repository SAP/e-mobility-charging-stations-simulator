/**
 * @file Tests for ChargingStation Transaction Management
 * @description Unit tests for transaction queries, energy meters, and concurrent transaction handling
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { OCPP16ServiceUtils } from '../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { OCPP20ServiceUtils } from '../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPVersion } from '../../src/types/index.js'
import { standardCleanup, withMockTimers } from '../helpers/TestLifecycleHelpers.js'
import { TEST_HEARTBEAT_INTERVAL_MS, TEST_ID_TAG } from './ChargingStationTestConstants.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

await describe('ChargingStation Transaction Management', async () => {
  await describe('Transaction Query', async () => {
    let station: ChargingStation | undefined

    beforeEach(() => {
      station = undefined
    })
    afterEach(() => {
      standardCleanup()
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
      assert.strictEqual(connectorId, undefined)
    })

    await it('should return connector id for getConnectorIdByTransactionId with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
        connector1.transactionIdTag = TEST_ID_TAG
      }

      // Act
      const connectorId = station.getConnectorIdByTransactionId(100)

      // Assert
      assert.strictEqual(connectorId, 1)
    })

    await it('should return undefined for getConnectorIdByTransactionId with undefined transactionId', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const connectorId = station.getConnectorIdByTransactionId(undefined)

      // Assert
      assert.strictEqual(connectorId, undefined)
    })

    await it('should return undefined for getEvseIdByTransactionId in non-EVSE mode', () => {
      // Arrange
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 0 },
      })
      station = result.station
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 100
      }

      // Act
      const evseId = station.getEvseIdByTransactionId(100)

      // Assert
      assert.strictEqual(evseId, undefined)
    })

    await it('should return EVSE id for getEvseIdByTransactionId in EVSE mode with active transaction', () => {
      // Arrange
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
      })
      station = result.station
      // Get connector in EVSE 1
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 200
        connector1.transactionIdTag = TEST_ID_TAG
      }

      // Act
      const evseId = station.getEvseIdByTransactionId(200)

      // Assert
      assert.strictEqual(evseId, 1)
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
      assert.strictEqual(idTag, 'MY-TAG-123')
    })

    await it('should return undefined for getTransactionIdTag with no matching transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const idTag = station.getTransactionIdTag(999)

      // Assert
      assert.strictEqual(idTag, undefined)
    })

    await it('should return zero for getNumberOfRunningTransactions with no transactions', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 3 })
      station = result.station

      // Act
      const count = station.getNumberOfRunningTransactions()

      // Assert
      assert.strictEqual(count, 0)
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
      assert.strictEqual(count, 2)
    })
  })

  await describe('Energy Meter', async () => {
    let station: ChargingStation | undefined

    beforeEach(() => {
      station = undefined
    })
    afterEach(() => {
      standardCleanup()
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
      assert.strictEqual(energy, 0)
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
      assert.strictEqual(energy, 12500)
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
      assert.strictEqual(energy, 12346)
    })

    await it('should return 0 for getEnergyActiveImportRegisterByConnectorId with invalid connector', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByConnectorId(99)

      // Assert
      assert.strictEqual(energy, 0)
    })

    await it('should return 0 for getEnergyActiveImportRegisterByTransactionId with no matching transaction', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Act
      const energy = station.getEnergyActiveImportRegisterByTransactionId(999)

      // Assert
      assert.strictEqual(energy, 0)
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
      assert.strictEqual(energy, 25000)
    })
  })

  await describe('Concurrent Transaction Scenarios', async () => {
    let station: ChargingStation | undefined

    beforeEach(() => {
      station = undefined
    })
    afterEach(() => {
      standardCleanup()
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
      assert.strictEqual(station.getNumberOfRunningTransactions(), 3)

      // Act & Assert - Transaction queries
      assert.strictEqual(station.getConnectorIdByTransactionId(100), 1)
      assert.strictEqual(station.getConnectorIdByTransactionId(101), 2)
      assert.strictEqual(station.getConnectorIdByTransactionId(102), 3)

      // Act & Assert - Energy meters
      assert.strictEqual(station.getEnergyActiveImportRegisterByTransactionId(100), 10000)
      assert.strictEqual(station.getEnergyActiveImportRegisterByTransactionId(101), 20000)
      assert.strictEqual(station.getEnergyActiveImportRegisterByTransactionId(102), 30000)

      // Act & Assert - Id tags
      assert.strictEqual(station.getTransactionIdTag(100), 'TAG-A')
      assert.strictEqual(station.getTransactionIdTag(101), 'TAG-B')
      assert.strictEqual(station.getTransactionIdTag(102), 'TAG-C')
    })

    await it('should handle transactions across multiple EVSEs', () => {
      // Arrange - 4 connectors across 2 EVSEs
      const result = createMockChargingStation({
        connectorsCount: 4,
        evseConfiguration: { evsesCount: 2 },
      })
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
      assert.strictEqual(station.getNumberOfRunningTransactions(), 2)

      // Act & Assert - EVSE queries
      assert.strictEqual(station.getEvseIdByTransactionId(500), 1)
      assert.strictEqual(station.getEvseIdByTransactionId(501), 2)

      // Act & Assert - Connector queries
      assert.strictEqual(station.getConnectorIdByTransactionId(500), 1)
      assert.strictEqual(station.getConnectorIdByTransactionId(501), 3)

      // Act & Assert - Energy meters
      assert.strictEqual(station.getEnergyActiveImportRegisterByTransactionId(500), 15000)
      assert.strictEqual(station.getEnergyActiveImportRegisterByTransactionId(501), 18000)
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
      assert.strictEqual(count, 1)
    })

    await it('should return idTag in EVSE mode for getTransactionIdTag', () => {
      // Arrange
      const result = createMockChargingStation({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
      })
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
      assert.strictEqual(idTag, 'EVSE-MODE-TAG')
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
      assert.strictEqual(unrounded, 12345.5)
      assert.strictEqual(rounded, 12346)
    })
  })

  await describe('Heartbeat and Meter Intervals', async () => {
    let station: ChargingStation | undefined

    beforeEach(() => {
      station = undefined
    })
    afterEach(() => {
      standardCleanup()
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should create interval when startHeartbeat() is called with valid interval', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({
          connectorsCount: 1,
          heartbeatInterval: TEST_HEARTBEAT_INTERVAL_MS,
        })
        station = result.station

        // Act
        station.startHeartbeat()

        // Assert - heartbeat interval should be created
        assert.notStrictEqual(station.heartbeatSetInterval, undefined)
        assert.strictEqual(typeof station.heartbeatSetInterval, 'object')
      })
    })

    await it('should restart heartbeat interval when restartHeartbeat() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({
          connectorsCount: 1,
          heartbeatInterval: TEST_HEARTBEAT_INTERVAL_MS,
        })
        station = result.station
        station.startHeartbeat()
        const firstInterval = station.heartbeatSetInterval

        // Act
        station.restartHeartbeat()
        const secondInterval = station.heartbeatSetInterval

        // Assert - interval should be different (old cleared, new created)
        assert.notStrictEqual(secondInterval, undefined)
        assert.strictEqual(typeof secondInterval, 'object')
        assert.ok(firstInterval !== secondInterval)
      })
    })

    await it('should not create heartbeat interval if already started', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({
          connectorsCount: 1,
          heartbeatInterval: TEST_HEARTBEAT_INTERVAL_MS,
        })
        station = result.station
        station.startHeartbeat()
        const firstInterval = station.heartbeatSetInterval

        // Act - call startHeartbeat again
        station.startHeartbeat()
        const secondInterval = station.heartbeatSetInterval

        // Assert - interval should be same (not restarted)
        assert.strictEqual(firstInterval, secondInterval)
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
        OCPP16ServiceUtils.startPeriodicMeterValues(station, 1, 10000)

        // Assert - meter values interval should be created
        if (connector1 != null) {
          assert.notStrictEqual(connector1.transactionMeterValuesSetInterval, undefined)
          assert.strictEqual(typeof connector1.transactionMeterValuesSetInterval, 'object')
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
        OCPP16ServiceUtils.startPeriodicMeterValues(station, 1, 10000)
        const firstInterval = connector1?.transactionMeterValuesSetInterval

        // Act
        OCPP16ServiceUtils.stopPeriodicMeterValues(station, 1)
        OCPP16ServiceUtils.startPeriodicMeterValues(station, 1, 15000)
        const secondInterval = connector1?.transactionMeterValuesSetInterval

        // Assert - interval should be different
        assert.notStrictEqual(secondInterval, undefined)
        assert.strictEqual(typeof secondInterval, 'object')
        assert.ok(firstInterval !== secondInterval)
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
        OCPP16ServiceUtils.startPeriodicMeterValues(station, 1, 10000)

        // Act
        OCPP16ServiceUtils.stopPeriodicMeterValues(station, 1)

        // Assert - interval should be cleared
        assert.strictEqual(connector1?.transactionMeterValuesSetInterval, undefined)
      })
    })

    await it('should create transaction updated interval when startTxUpdatedInterval() is called for OCPP 2.0', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({
          connectorsCount: 2,
          ocppVersion: OCPPVersion.VERSION_20,
        })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }

        // Act
        OCPP20ServiceUtils.startPeriodicMeterValues(station, 1, 5000)

        // Assert - transaction updated interval should be created
        if (connector1 != null) {
          assert.notStrictEqual(connector1.transactionMeterValuesSetInterval, undefined)
          assert.strictEqual(typeof connector1.transactionMeterValuesSetInterval, 'object')
        }
      })
    })

    await it('should clear transaction updated interval when stopTxUpdatedInterval() is called', async t => {
      await withMockTimers(t, ['setInterval'], () => {
        // Arrange
        const result = createMockChargingStation({
          connectorsCount: 2,
          ocppVersion: OCPPVersion.VERSION_20,
        })
        station = result.station
        const connector1 = station.getConnectorStatus(1)
        if (connector1 != null) {
          connector1.transactionStarted = true
          connector1.transactionId = 100
        }
        OCPP20ServiceUtils.startPeriodicMeterValues(station, 1, 5000)

        // Act
        OCPP20ServiceUtils.stopPeriodicMeterValues(station, 1)

        // Assert - interval should be cleared
        assert.strictEqual(connector1?.transactionMeterValuesSetInterval, undefined)
      })
    })
  })
})
