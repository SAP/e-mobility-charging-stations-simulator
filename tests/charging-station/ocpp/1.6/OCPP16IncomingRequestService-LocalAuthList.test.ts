/**
 * @file Tests for OCPP16IncomingRequestService LocalAuthList handlers
 * @description Unit tests for OCPP 1.6 GetLocalListVersion and SendLocalList
 * incoming request handlers
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  LocalAuthListManager,
  OCPPAuthService,
} from '../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'
import type { OCPP16SendLocalListRequest } from '../../../../src/types/index.js'

import { InMemoryLocalAuthListManager } from '../../../../src/charging-station/ocpp/auth/cache/InMemoryLocalAuthListManager.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import {
  OCPP16AuthorizationStatus,
  OCPP16StandardParametersKey,
  OCPP16UpdateStatus,
  OCPP16UpdateType,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

/**
 * @param manager - LocalAuthListManager instance or undefined
 * @returns Mock OCPPAuthService wired to the given manager
 */
function createMockAuthService (manager: LocalAuthListManager | undefined): OCPPAuthService {
  return {
    authorize: async () => Promise.resolve({ status: 'Accepted' }),
    getAuthCache: () => undefined,
    getLocalAuthListManager: () => manager,
    getStats: () => ({
      avgResponseTime: 0,
      cacheHitRate: 0,
      failedAuth: 0,
      lastUpdatedDate: new Date(),
      localUsageRate: 0,
      remoteSuccessRate: 0,
      successfulAuth: 0,
      totalRequests: 0,
    }),
    initialize: () => undefined,
  } as unknown as OCPPAuthService
}

/**
 * @param context - Test context with station and service
 */
function enableLocalAuthListProfile (context: OCPP16IncomingRequestTestContext): void {
  const { station } = context
  upsertConfigurationKey(
    station,
    OCPP16StandardParametersKey.SupportedFeatureProfiles,
    'Core,LocalAuthListManagement'
  )
  upsertConfigurationKey(station, OCPP16StandardParametersKey.LocalAuthListEnabled, 'true')
  upsertConfigurationKey(station, OCPP16StandardParametersKey.SendLocalListMaxLength, '20')
}

/**
 * @param station - Charging station to configure mock for
 * @param manager - LocalAuthListManager instance or undefined
 */
function setupMockAuthService (
  station: ChargingStation,
  manager: LocalAuthListManager | undefined
): void {
  const stationId = station.stationInfo?.chargingStationId ?? 'unknown'
  OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService(manager))
}

await describe('OCPP16IncomingRequestService — LocalAuthList', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  // =========================================================================
  // GetLocalListVersion
  // =========================================================================

  await describe('handleRequestGetLocalListVersion', async () => {
    await it('should return 0 for empty list', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      setupMockAuthService(station, manager)

      const response = testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.listVersion, 0)
    })

    await it('should return -1 when feature profile disabled', () => {
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      const response = testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.listVersion, -1)
    })

    await it('should return -1 when manager undefined', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      setupMockAuthService(station, undefined)

      const response = testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.listVersion, -1)
    })

    await it('should return current version after update', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      manager.setEntries([{ identifier: 'TAG-001', status: 'Accepted' }], 5)
      setupMockAuthService(station, manager)

      const response = testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.listVersion, 5)
    })
  })

  // =========================================================================
  // SendLocalList
  // =========================================================================

  await describe('handleRequestSendLocalList', async () => {
    await it('should accept Full update and replace list', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 1,
        localAuthorizationList: [
          { idTag: 'TAG-001', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
          { idTag: 'TAG-002', idTagInfo: { status: OCPP16AuthorizationStatus.BLOCKED } },
        ],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.ACCEPTED)
      assert.strictEqual(manager.getVersion(), 1)
      const entries = manager.getAllEntries()
      assert.strictEqual(entries.length, 2)
    })

    await it('should accept Differential update with adds and removes', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      manager.setEntries(
        [
          { identifier: 'TAG-001', status: 'Accepted' },
          { identifier: 'TAG-002', status: 'Accepted' },
        ],
        1
      )
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 2,
        localAuthorizationList: [
          { idTag: 'TAG-003', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
          { idTag: 'TAG-001' },
        ],
        updateType: OCPP16UpdateType.Differential,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.ACCEPTED)
      assert.strictEqual(manager.getVersion(), 2)
      const entry001 = manager.getEntry('TAG-001')
      assert.strictEqual(entry001, undefined)
      const entry003 = manager.getEntry('TAG-003')
      assert.notStrictEqual(entry003, undefined)
      assert.strictEqual(entry003?.status, 'Accepted')
    })

    await it('should return NotSupported when feature profile disabled', () => {
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      const request: OCPP16SendLocalListRequest = {
        listVersion: 1,
        localAuthorizationList: [],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.NOT_SUPPORTED)
    })

    await it('should return Failed with listVersion=-1', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: -1,
        localAuthorizationList: [],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.FAILED)
    })

    await it('should return Failed with listVersion=0', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 0,
        localAuthorizationList: [],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.FAILED)
    })

    await it('should return NotSupported when manager is undefined', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      setupMockAuthService(station, undefined)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 1,
        localAuthorizationList: [],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.NOT_SUPPORTED)
    })

    await it('should accept Full update with empty list to clear all entries', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      manager.setEntries(
        [
          { identifier: 'TAG-001', status: 'Accepted' },
          { identifier: 'TAG-002', status: 'Accepted' },
        ],
        1
      )
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 2,
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.ACCEPTED)
      assert.strictEqual(manager.getVersion(), 2)
      const entries = manager.getAllEntries()
      assert.strictEqual(entries.length, 0)
    })

    await it('should return Failed when list exceeds SendLocalListMaxLength', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SendLocalListMaxLength, '1')
      const manager = new InMemoryLocalAuthListManager()
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 1,
        localAuthorizationList: [
          { idTag: 'TAG-001', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
          { idTag: 'TAG-002', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
        ],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.FAILED)
    })

    await it('should return NotSupported when LocalAuthListEnabled is false', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      upsertConfigurationKey(station, OCPP16StandardParametersKey.LocalAuthListEnabled, 'false')
      const manager = new InMemoryLocalAuthListManager()
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 1,
        localAuthorizationList: [],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.NOT_SUPPORTED)
    })

    await it('should return VersionMismatch for differential update with version <= current', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      manager.setEntries([{ identifier: 'TAG-001', status: 'Accepted' }], 5)
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 3,
        localAuthorizationList: [
          { idTag: 'TAG-002', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
        ],
        updateType: OCPP16UpdateType.Differential,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.VERSION_MISMATCH)
    })

    await it('should return VersionMismatch for differential update with version equal to current', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      manager.setEntries([{ identifier: 'TAG-001', status: 'Accepted' }], 5)
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 5,
        localAuthorizationList: [
          { idTag: 'TAG-002', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
        ],
        updateType: OCPP16UpdateType.Differential,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.VERSION_MISMATCH)
    })

    await it('should accept Full update regardless of version (no VersionMismatch)', () => {
      const { station, testableService } = context
      enableLocalAuthListProfile(context)
      const manager = new InMemoryLocalAuthListManager()
      manager.setEntries([{ identifier: 'TAG-001', status: 'Accepted' }], 5)
      setupMockAuthService(station, manager)

      const request: OCPP16SendLocalListRequest = {
        listVersion: 3,
        localAuthorizationList: [
          { idTag: 'TAG-002', idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
        ],
        updateType: OCPP16UpdateType.Full,
      }

      const response = testableService.handleRequestSendLocalList(station, request)

      assert.strictEqual(response.status, OCPP16UpdateStatus.ACCEPTED)
    })
  })
})
