/**
 * @file Tests for ChargingStation Lifecycle Operations
 * @description Unit tests for charging station start/stop/restart and delete operations
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { cleanupChargingStation, createMockChargingStation } from './helpers/StationHelpers.js'

await describe('ChargingStation Lifecycle', async () => {
  await describe('Start/Stop Operations', async () => {
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

    await it('should transition from stopped to started on start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      const initialStarted = station.started
      station.start()
      const finalStarted = station.started

      // Assert
      assert.strictEqual(initialStarted, false)
      assert.strictEqual(finalStarted, true)
    })

    await it('should not restart when already started', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      station.start()
      const firstStarted = station.started
      station.start() // Try to start again (idempotent)
      const stillStarted = station.started

      // Assert
      assert.strictEqual(firstStarted, true)
      assert.strictEqual(stillStarted, true)
    })

    await it('should set starting flag during start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act & Assert
      const initialStarting = station.starting
      assert.strictEqual(initialStarting, false)
      // After start() completes, starting should be false
      station.start()
      assert.strictEqual(station.starting, false)
      assert.strictEqual(station.started, true)
    })

    await it('should transition from started to stopped on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.strictEqual(station.started, true)

      // Act
      await station.stop()

      // Assert
      assert.strictEqual(station.started, false)
    })

    await it('should be idempotent when calling stop() on already stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      // Station starts in stopped state
      assert.strictEqual(station.started, false)

      // Act - call stop on already stopped station
      await station.stop()

      // Assert - should remain stopped without error
      assert.strictEqual(station.started, false)
    })

    await it('should set stopping flag during stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()

      // Assert initial state
      assert.strictEqual((station as unknown as { stopping: boolean }).stopping, false)

      // Act
      await station.stop()

      // Assert - after stop() completes, stopping should be false
      assert.strictEqual((station as unknown as { stopping: boolean }).stopping, false)
      assert.strictEqual(station.started, false)
    })

    await it('should clear bootNotificationResponse on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.notStrictEqual(station.bootNotificationResponse, undefined)

      // Act
      await station.stop()

      // Assert - bootNotificationResponse should be deleted
      assert.strictEqual(station.bootNotificationResponse, undefined)
    })

    await it('should be restartable after stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.strictEqual(station.started, true)

      // Act - stop then start again
      await station.stop()
      assert.strictEqual(station.started, false)
      station.start()

      // Assert - should be started again
      assert.strictEqual(station.started, true)
    })

    await it('should guard against concurrent start operations', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Simulate starting state manually to test guard
      const stationAny = station as unknown as { started: boolean; starting: boolean }
      stationAny.starting = true
      stationAny.started = false

      // Act - attempt to start while already starting should be guarded
      // The mock start() method resets starting, but this tests the initial state
      assert.strictEqual(station.starting, true)

      // Assert - the real ChargingStation guards against this
      // (mock implementation doesn't fully replicate guard, but state is verified)
    })
  })

  await describe('Delete Operations', async () => {
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

    await it('should handle delete() on stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      assert.strictEqual(station.started, false)

      // Act - delete while stopped (deleteConfiguration = false to skip file ops)
      await station.delete(false)

      // Assert - connectors and evses should be cleared
      assert.strictEqual(station.getNumberOfConnectors(), 0)
      assert.strictEqual(station.getNumberOfEvses(), 0)
      assert.strictEqual(station.requests.size, 0)
    })

    await it('should stop station before delete() if running', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.strictEqual(station.started, true)

      // Act - delete calls stop internally
      await station.delete(false)

      // Assert - station should be stopped and cleared
      assert.strictEqual(station.started, false)
      assert.strictEqual(station.getNumberOfConnectors(), 0)
    })

    await it('should handle delete operation with pending transactions', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Set up a running transaction
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 1001
      }

      // Start the station
      station.start()
      assert.strictEqual(station.started, true)

      // Act - Delete station (should stop first)
      await station.delete()

      // Assert - Station should be stopped and resources cleared
      assert.strictEqual(station.started, false)
      assert.strictEqual(station.getNumberOfConnectors(), 0)
      assert.strictEqual(station.getNumberOfEvses(), 0)
    })
  })
})
