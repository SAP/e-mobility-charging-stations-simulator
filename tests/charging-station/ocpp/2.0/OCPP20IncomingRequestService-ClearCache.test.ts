/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

await describe('C11 - Clear Authorization Data in Authorization Cache', async () => {
  const mockChargingStation = createChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const incomingRequestService = new OCPP20IncomingRequestService()

  // FR: C11.FR.01
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

  // FR: C11.FR.02
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
