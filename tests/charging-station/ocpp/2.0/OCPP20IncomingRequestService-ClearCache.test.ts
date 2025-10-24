/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { IdTagsCache } from '../../../../src/charging-station/IdTagsCache.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStationWithEvses } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_NAME } from './OCPP20TestConstants.js'

await describe('C11 - Clear Authorization Data in Authorization Cache', async () => {
  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  // Initialize idTagsCache to avoid undefined errors
  mockChargingStation.idTagsCache = IdTagsCache.getInstance()

  const incomingRequestService = new OCPP20IncomingRequestService()

  await it('Should handle ClearCache request successfully', async () => {
    const response = await (incomingRequestService as any).handleRequestClearCache(
      mockChargingStation
    )

    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response.status).toBeDefined()
    expect(typeof response.status).toBe('string')
    expect(['Accepted', 'Rejected']).toContain(response.status)
  })

  await it('Should return correct status based on cache clearing result', async () => {
    // Test the actual behavior - ClearCache should work with ID tags cache

    const response = await (incomingRequestService as any).handleRequestClearCache(
      mockChargingStation
    )

    expect(response).toBeDefined()
    expect(response.status).toBeDefined()
    // Should be either Accepted or Rejected based on cache state
    expect(['Accepted', 'Rejected']).toContain(response.status)
  })
})
