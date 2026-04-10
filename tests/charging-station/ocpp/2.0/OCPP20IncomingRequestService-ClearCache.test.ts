/**
 * @file Tests for OCPP20IncomingRequestService ClearCache
 * @description Unit tests for OCPP 2.0 ClearCache command handling (C11)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/index.js'
import { GenericStatus, OCPPVersion } from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('C11 - Clear Authorization Data in Authorization Cache', async () => {
  afterEach(() => {
    standardCleanup()
  })

  let station: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  // FR: C11.FR.01 - CS SHALL attempt to clear its Authorization Cache
  await it('should handle ClearCache request successfully', async () => {
    const response = await testableService.handleRequestClearCache(station)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(typeof response.status, 'string')
    assert.ok([GenericStatus.Accepted, GenericStatus.Rejected].includes(response.status))
  })

  // FR: C11.FR.02 - Return correct status based on cache clearing result
  await it('should return correct status based on cache clearing result', async () => {
    const response = await testableService.handleRequestClearCache(station)

    assert.notStrictEqual(response, undefined)
    assert.notStrictEqual(response.status, undefined)
    // Should be either Accepted or Rejected based on cache state
    assert.ok([GenericStatus.Accepted, GenericStatus.Rejected].includes(response.status))
  })

  // CLR-001: Verify Authorization Cache is cleared (not IdTagsCache)
  await describe('CLR-001 - ClearCache clears Authorization Cache', async () => {
    await it('should call authService.clearCache() on ClearCache request', async () => {
      // Create a mock auth service to verify clearCache is called
      const clearCacheMock = mock.fn()
      const mockAuthService = {
        clearCache: clearCacheMock,
        getConfiguration: () => ({
          authorizationCacheEnabled: true,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      try {
        const response = await testableService.handleRequestClearCache(station)

        assert.strictEqual(clearCacheMock.mock.callCount(), 1)
        assert.strictEqual(response.status, GenericStatus.Accepted)
      } finally {
        // Restore original factory method
        Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
      }
    })

    await it('should not call idTagsCache.deleteIdTags() on ClearCache request', async () => {
      // Verify that IdTagsCache is not touched
      const deleteIdTagsMock = mock.fn()
      const originalDeleteIdTags = station.idTagsCache.deleteIdTags.bind(station.idTagsCache)

      Object.assign(station.idTagsCache, {
        deleteIdTags: deleteIdTagsMock,
      })

      try {
        await testableService.handleRequestClearCache(station)
        assert.strictEqual(deleteIdTagsMock.mock.callCount(), 0)
      } finally {
        // Restore original method
        Object.assign(station.idTagsCache, { deleteIdTags: originalDeleteIdTags })
      }
    })
  })

  // CLR-002: Verify AuthCacheEnabled check per C11.FR.04
  await describe('CLR-002 - AuthCacheEnabled Check (C11.FR.04)', async () => {
    await it('should return Rejected when AuthCacheEnabled is false', async () => {
      // Create a mock auth service with cache disabled
      const mockAuthService = {
        clearCache: (): void => {
          throw new Error('clearCache should not be called when cache is disabled')
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: false,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      try {
        const response = await testableService.handleRequestClearCache(station)

        assert.strictEqual(response.status, GenericStatus.Rejected)
      } finally {
        // Restore original factory method
        Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
      }
    })

    await it('should return Accepted when AuthCacheEnabled is true and clear succeeds', async () => {
      // Create a mock auth service with cache enabled
      const mockAuthService = {
        clearCache: (): void => {
          /* empty */
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: true,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      try {
        const response = await testableService.handleRequestClearCache(station)

        assert.strictEqual(response.status, GenericStatus.Accepted)
      } finally {
        // Restore original factory method
        Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
      }
    })

    await it('should return Rejected when clearCache throws an error', async () => {
      // Create a mock auth service that throws on clearCache
      const mockAuthService = {
        clearCache: (): void => {
          throw new Error('Cache clear failed')
        },
        getConfiguration: () => ({
          authorizationCacheEnabled: true,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      try {
        const response = await testableService.handleRequestClearCache(station)

        assert.strictEqual(response.status, GenericStatus.Rejected)
      } finally {
        // Restore original factory method
        Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
      }
    })

    await it('should not attempt to clear cache when AuthCacheEnabled is false', async () => {
      const clearCacheMock = mock.fn()
      const mockAuthService = {
        clearCache: clearCacheMock,
        getConfiguration: () => ({
          authorizationCacheEnabled: false,
        }),
      }

      // Mock the factory to return our mock auth service
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      try {
        await testableService.handleRequestClearCache(station)

        // clearCache should NOT be called when cache is disabled
        assert.strictEqual(clearCacheMock.mock.callCount(), 0)
      } finally {
        // Restore original factory method
        Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
      }
    })
  })

  // C11.FR.05: IF the CS does not support an Authorization Cache → Rejected
  await describe('C11.FR.05 - No Authorization Cache Support', async () => {
    await it('should return Rejected when authService factory fails (no cache support)', async () => {
      // Mock factory to throw error (simulates no Authorization Cache support)
      const originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): never => {
          throw new Error('Authorization Cache not supported')
        },
      })

      try {
        const response = await testableService.handleRequestClearCache(station)

        // Per C11.FR.05: SHALL return Rejected if CS does not support Authorization Cache
        assert.strictEqual(response.status, GenericStatus.Rejected)
      } finally {
        // Restore original factory method
        Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
      }
    })
  })
})
