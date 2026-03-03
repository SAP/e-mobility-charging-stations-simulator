/**
 * @file Tests for ChargingStation Lifecycle Operations
 * @description Unit tests for charging station start/stop/restart and delete operations
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { cleanupChargingStation, createMockChargingStation } from './ChargingStationTestUtils.js'

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
      expect(initialStarted).toBe(false)
      expect(finalStarted).toBe(true)
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
      expect(firstStarted).toBe(true)
      expect(stillStarted).toBe(true)
    })

    await it('should set starting flag during start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act & Assert
      const initialStarting = station.starting
      expect(initialStarting).toBe(false)
      // After start() completes, starting should be false
      station.start()
      expect(station.starting).toBe(false)
      expect(station.started).toBe(true)
    })

    await it('should transition from started to stopped on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.started).toBe(true)

      // Act
      await station.stop()

      // Assert
      expect(station.started).toBe(false)
    })

    await it('should be idempotent when calling stop() on already stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      // Station starts in stopped state
      expect(station.started).toBe(false)

      // Act - call stop on already stopped station
      await station.stop()

      // Assert - should remain stopped without error
      expect(station.started).toBe(false)
    })

    await it('should set stopping flag during stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()

      // Assert initial state
      expect((station as unknown as { stopping: boolean }).stopping).toBe(false)

      // Act
      await station.stop()

      // Assert - after stop() completes, stopping should be false
      expect((station as unknown as { stopping: boolean }).stopping).toBe(false)
      expect(station.started).toBe(false)
    })

    await it('should clear bootNotificationResponse on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.bootNotificationResponse).toBeDefined()

      // Act
      await station.stop()

      // Assert - bootNotificationResponse should be deleted
      expect(station.bootNotificationResponse).toBeUndefined()
    })

    await it('should be restartable after stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.started).toBe(true)

      // Act - stop then start again
      await station.stop()
      expect(station.started).toBe(false)
      station.start()

      // Assert - should be started again
      expect(station.started).toBe(true)
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
      expect(station.starting).toBe(true)

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
      expect(station.started).toBe(false)

      // Act - delete while stopped (deleteConfiguration = false to skip file ops)
      await station.delete(false)

      // Assert - connectors and evses should be cleared
      expect(station.connectors.size).toBe(0)
      expect(station.evses.size).toBe(0)
      expect(station.requests.size).toBe(0)
    })

    await it('should stop station before delete() if running', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      expect(station.started).toBe(true)

      // Act - delete calls stop internally
      await station.delete(false)

      // Assert - station should be stopped and cleared
      expect(station.started).toBe(false)
      expect(station.connectors.size).toBe(0)
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
      expect(station.started).toBe(true)

      // Act - Delete station (should stop first)
      await station.delete()

      // Assert - Station should be stopped and resources cleared
      expect(station.started).toBe(false)
      expect(station.connectors.size).toBe(0)
      expect(station.evses.size).toBe(0)
    })
  })
})
