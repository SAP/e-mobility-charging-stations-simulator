import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { cleanupChargingStation, createRealChargingStation } from './ChargingStationTestUtils.js'

await describe('ChargingStation', async () => {
  await describe('Lifecycle', async () => {
    let station: ChargingStation | undefined

    afterEach(() => {
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should transition from stopped to started on start()', () => {
      // Arrange
      const result = createRealChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      const initialStarted = station.started
      station.start()
      const finalStarted = station.started

      // Assert
      expect(initialStarted).toBe(false)
      expect(finalStarted).toBe(true)
    })
  })
})
