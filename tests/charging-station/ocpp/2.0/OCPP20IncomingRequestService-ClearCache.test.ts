/**
 * @file Tests for OCPP20IncomingRequestService ClearCache
 * @description Unit tests for OCPP 2.0 ClearCache command handling (C11)
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { GenericStatus, OCPPVersion } from '../../../../src/types/index.js'
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

  // FR: C11.FR.01 - CS SHALL attempt to clear its Authorization Cache
  await it('Should handle ClearCache request successfully', async () => {
    const response = await (incomingRequestService as any).handleRequestClearCache(
      mockChargingStation
    )

    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response.status).toBeDefined()
    expect(typeof response.status).toBe('string')
    expect([GenericStatus.Accepted, GenericStatus.Rejected]).toContain(response.status)
  })

  // FR: C11.FR.02 - Return correct status based on cache clearing result
  await it('Should return correct status based on cache clearing result', async () => {
    const response = await (incomingRequestService as any).handleRequestClearCache(
      mockChargingStation
    )

    expect(response).toBeDefined()
    expect(response.status).toBeDefined()
    // Should be either Accepted or Rejected based on cache state
    expect([GenericStatus.Accepted, GenericStatus.Rejected]).toContain(response.status)
  })

  // CLR-001: Verify Authorization Cache is cleared (not IdTagsCache)
  await describe('CLR-001 - ClearCache clears Authorization Cache', async () => {
    await it('Should call authService.clearCache() on ClearCache request', async () => {
      // Create a mock auth service to verify clearCache is called
      let clearCacheCalled = false
      const mockAuthService = {
        clearCache: (): Promise<void> => {
          clearCacheCalled = true
          return Promise.resolve()
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: true,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      ;(OCPPAuthServiceFactory as any).getInstance = (): Promise<typeof mockAuthService> =>
        Promise.resolve(mockAuthService)

      try {
        const response = await (incomingRequestService as any).handleRequestClearCache(
          mockChargingStation
        )

        expect(clearCacheCalled).toBe(true)
        expect(response.status).toBe(GenericStatus.Accepted)
      } finally {
        // Restore original factory method
        ;(OCPPAuthServiceFactory as any).getInstance = originalGetInstance
      }
    })

    await it('Should NOT call idTagsCache.deleteIdTags() on ClearCache request', async () => {
      // Verify that IdTagsCache is not touched
      let deleteIdTagsCalled = false
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalDeleteIdTags = mockChargingStation.idTagsCache.deleteIdTags

      ;(mockChargingStation.idTagsCache as any).deleteIdTags = () => {
        deleteIdTagsCalled = true
      }

      try {
        await (incomingRequestService as any).handleRequestClearCache(mockChargingStation)
        expect(deleteIdTagsCalled).toBe(false)
      } finally {
        // Restore original method
        ;(mockChargingStation.idTagsCache as any).deleteIdTags = originalDeleteIdTags
      }
    })
  })

  // CLR-002: Verify AuthCacheEnabled check per C11.FR.04
  await describe('CLR-002 - AuthCacheEnabled Check (C11.FR.04)', async () => {
    await it('Should return Rejected when AuthCacheEnabled is false', async () => {
      // Create a mock auth service with cache disabled
      const mockAuthService = {
        clearCache: (): Promise<void> => {
          throw new Error('clearCache should not be called when cache is disabled')
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: false,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      ;(OCPPAuthServiceFactory as any).getInstance = (): Promise<typeof mockAuthService> =>
        Promise.resolve(mockAuthService)

      try {
        const response = await (incomingRequestService as any).handleRequestClearCache(
          mockChargingStation
        )

        expect(response.status).toBe(GenericStatus.Rejected)
      } finally {
        // Restore original factory method
        ;(OCPPAuthServiceFactory as any).getInstance = originalGetInstance
      }
    })

    await it('Should return Accepted when AuthCacheEnabled is true and clear succeeds', async () => {
      // Create a mock auth service with cache enabled
      const mockAuthService = {
        clearCache: (): Promise<void> => {
          // Successful clear
          return Promise.resolve()
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: true,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      ;(OCPPAuthServiceFactory as any).getInstance = (): Promise<typeof mockAuthService> =>
        Promise.resolve(mockAuthService)

      try {
        const response = await (incomingRequestService as any).handleRequestClearCache(
          mockChargingStation
        )

        expect(response.status).toBe(GenericStatus.Accepted)
      } finally {
        // Restore original factory method
        ;(OCPPAuthServiceFactory as any).getInstance = originalGetInstance
      }
    })

    await it('Should return Rejected when clearCache throws an error', async () => {
      // Create a mock auth service that throws on clearCache
      const mockAuthService = {
        clearCache: (): Promise<void> => {
          return Promise.reject(new Error('Cache clear failed'))
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: true,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      ;(OCPPAuthServiceFactory as any).getInstance = (): Promise<typeof mockAuthService> =>
        Promise.resolve(mockAuthService)

      try {
        const response = await (incomingRequestService as any).handleRequestClearCache(
          mockChargingStation
        )

        expect(response.status).toBe(GenericStatus.Rejected)
      } finally {
        // Restore original factory method
        ;(OCPPAuthServiceFactory as any).getInstance = originalGetInstance
      }
    })

    await it('Should not attempt to clear cache when AuthCacheEnabled is false', async () => {
      let clearCacheAttempted = false
      const mockAuthService = {
        clearCache: (): Promise<void> => {
          clearCacheAttempted = true
          return Promise.resolve()
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: false,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      ;(OCPPAuthServiceFactory as any).getInstance = (): Promise<typeof mockAuthService> =>
        Promise.resolve(mockAuthService)

      try {
        await (incomingRequestService as any).handleRequestClearCache(mockChargingStation)

        // clearCache should NOT be called when cache is disabled
        expect(clearCacheAttempted).toBe(false)
      } finally {
        // Restore original factory method
        ;(OCPPAuthServiceFactory as any).getInstance = originalGetInstance
      }
    })
  })

  // C11.FR.05: IF the CS does not support an Authorization Cache → Rejected
  await describe('C11.FR.05 - No Authorization Cache Support', async () => {
    await it('Should return Rejected when authService factory fails (no cache support)', async () => {
      // Mock factory to throw error (simulates no Authorization Cache support)
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      ;(OCPPAuthServiceFactory as any).getInstance = (): Promise<never> =>
        Promise.reject(new Error('Authorization Cache not supported'))

      try {
        const response = await (incomingRequestService as any).handleRequestClearCache(
          mockChargingStation
        )

        // Per C11.FR.05: SHALL return Rejected if CS does not support Authorization Cache
        expect(response.status).toBe(GenericStatus.Rejected)
      } finally {
        // Restore original factory method
        ;(OCPPAuthServiceFactory as any).getInstance = originalGetInstance
      }
    })
  })
})
