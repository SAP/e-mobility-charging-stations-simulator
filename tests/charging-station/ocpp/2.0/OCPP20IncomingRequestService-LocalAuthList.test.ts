/**
 * @file Tests for OCPP20IncomingRequestService LocalAuthList handlers
 * @description Unit tests for OCPP 2.0 GetLocalListVersion and SendLocalList command handling (D01/D02)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  InMemoryLocalAuthListManager,
  OCPPAuthServiceFactory,
} from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20IdTokenEnumType,
  OCPP20SendLocalListStatusEnumType,
  OCPP20UpdateEnumType,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('OCPP20IncomingRequestService — LocalAuthList', async () => {
  let station: ChargingStation
  let testableService: ReturnType<typeof createTestableIncomingRequestService>
  let originalGetInstance: typeof OCPPAuthServiceFactory.getInstance

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
    const incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    originalGetInstance = OCPPAuthServiceFactory.getInstance.bind(OCPPAuthServiceFactory)
  })

  afterEach(() => {
    Object.assign(OCPPAuthServiceFactory, { getInstance: originalGetInstance })
    standardCleanup()
  })

  // ============================================================================
  // GetLocalListVersion
  // ============================================================================

  await describe('GetLocalListVersion', async () => {
    await it('should return version 0 for empty list', async () => {
      const manager = new InMemoryLocalAuthListManager()
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.versionNumber, 0)
    })

    await it('should return version 0 when local auth list disabled', async () => {
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: false }),
        getLocalAuthListManager: () => undefined,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.versionNumber, 0)
    })

    await it('should return version 0 when manager is undefined', async () => {
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => undefined,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.versionNumber, 0)
    })

    await it('should return correct version after SendLocalList', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries([{ identifier: 'TOKEN_001', status: 'Accepted' }], 5)
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.versionNumber, 5)
    })

    await it('should return version 0 when auth service throws', async () => {
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): never => {
          throw new Error('Auth service unavailable')
        },
      })

      const response = await testableService.handleRequestGetLocalListVersion(station)

      assert.strictEqual(response.versionNumber, 0)
    })
  })

  // ============================================================================
  // SendLocalList
  // ============================================================================

  await describe('SendLocalList', async () => {
    await it('should accept Full update and replace list', async () => {
      const manager = new InMemoryLocalAuthListManager()
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'TOKEN_001', type: OCPP20IdTokenEnumType.ISO14443 },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
          },
          {
            idToken: { idToken: 'TOKEN_002', type: OCPP20IdTokenEnumType.eMAID },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Blocked },
          },
        ],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 3,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Accepted)

      const entries = await manager.getAllEntries()
      assert.strictEqual(entries.length, 2)

      const version = await manager.getVersion()
      assert.strictEqual(version, 3)
    })

    await it('should accept Differential update with complex IdToken types', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries([{ identifier: 'EXISTING_001', status: 'Accepted' }], 1)
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'NEW_TOKEN', type: OCPP20IdTokenEnumType.ISO15693 },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
          },
        ],
        updateType: OCPP20UpdateEnumType.Differential,
        versionNumber: 2,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Accepted)

      const entries = await manager.getAllEntries()
      assert.strictEqual(entries.length, 2)

      const version = await manager.getVersion()
      assert.strictEqual(version, 2)
    })

    await it('should return Failed when disabled (with statusInfo)', async () => {
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: false }),
        getLocalAuthListManager: () => undefined,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 1,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Failed)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.NotEnabled)
    })

    await it('should return Failed when manager is undefined', async () => {
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => undefined,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 1,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Failed)
      assert.notStrictEqual(response.statusInfo, undefined)
    })

    await it('should clear all entries with Full update and empty list', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries(
        [
          { identifier: 'TOKEN_A', status: 'Accepted' },
          { identifier: 'TOKEN_B', status: 'Accepted' },
        ],
        1
      )
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 2,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Accepted)

      const entries = await manager.getAllEntries()
      assert.strictEqual(entries.length, 0)

      const version = await manager.getVersion()
      assert.strictEqual(version, 2)
    })

    await it('should return Failed when auth service throws', async () => {
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): never => {
          throw new Error('Auth service unavailable')
        },
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 1,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Failed)
    })

    await it('should handle Differential update removing entries (no idTokenInfo)', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries(
        [
          { identifier: 'REMOVE_ME', status: 'Accepted' },
          { identifier: 'KEEP_ME', status: 'Accepted' },
        ],
        1
      )
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'REMOVE_ME', type: OCPP20IdTokenEnumType.ISO14443 },
            // No idTokenInfo → status will be undefined → removal in differential
          },
        ],
        updateType: OCPP20UpdateEnumType.Differential,
        versionNumber: 2,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Accepted)

      const entries = await manager.getAllEntries()
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].identifier, 'KEEP_ME')

      const version = await manager.getVersion()
      assert.strictEqual(version, 2)
    })

    await it('should preserve idTokenType metadata in entries', async () => {
      const manager = new InMemoryLocalAuthListManager()
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'EMAID_TOKEN', type: OCPP20IdTokenEnumType.eMAID },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
          },
        ],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 1,
      })

      const entry = await manager.getEntry('EMAID_TOKEN')
      assert.ok(entry != null)
      assert.strictEqual(entry.status, 'Accepted')
      assert.deepStrictEqual(entry.metadata, { idTokenType: OCPP20IdTokenEnumType.eMAID })
    })

    await it('should handle Full update with undefined localAuthorizationList', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries([{ identifier: 'OLD_TOKEN', status: 'Accepted' }], 1)
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 2,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Accepted)

      const entries = await manager.getAllEntries()
      assert.strictEqual(entries.length, 0)

      const version = await manager.getVersion()
      assert.strictEqual(version, 2)
    })

    await it('should convert cacheExpiryDateTime to Date', async () => {
      const manager = new InMemoryLocalAuthListManager()
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const expiryDate = new Date('2027-01-01T00:00:00.000Z')

      await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'EXPIRY_TOKEN', type: OCPP20IdTokenEnumType.ISO14443 },
            idTokenInfo: {
              cacheExpiryDateTime: expiryDate,
              status: OCPP20AuthorizationStatusEnumType.Accepted,
            },
          },
        ],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 1,
      })

      const entry = await manager.getEntry('EXPIRY_TOKEN')
      assert.notStrictEqual(entry, undefined)
      assert.ok(entry?.expiryDate instanceof Date)
    })

    await it('should return VersionMismatch for differential update with version < current', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries([{ identifier: 'TOKEN_001', status: 'Accepted' }], 5)
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'NEW_TOKEN', type: OCPP20IdTokenEnumType.ISO14443 },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
          },
        ],
        updateType: OCPP20UpdateEnumType.Differential,
        versionNumber: 3,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.VersionMismatch)
    })

    await it('should return VersionMismatch for differential update with version equal to current', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries([{ identifier: 'TOKEN_001', status: 'Accepted' }], 5)
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'NEW_TOKEN', type: OCPP20IdTokenEnumType.ISO14443 },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
          },
        ],
        updateType: OCPP20UpdateEnumType.Differential,
        versionNumber: 5,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.VersionMismatch)
    })

    await it('should accept Full update regardless of version (no VersionMismatch)', async () => {
      const manager = new InMemoryLocalAuthListManager()
      await manager.setEntries([{ identifier: 'TOKEN_001', status: 'Accepted' }], 5)
      const mockAuthService = {
        getConfiguration: () => ({ localAuthListEnabled: true }),
        getLocalAuthListManager: () => manager,
      }
      Object.assign(OCPPAuthServiceFactory, {
        getInstance: (): typeof mockAuthService => mockAuthService,
      })

      const response = await testableService.handleRequestSendLocalList(station, {
        localAuthorizationList: [
          {
            idToken: { idToken: 'NEW_TOKEN', type: OCPP20IdTokenEnumType.ISO14443 },
            idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted },
          },
        ],
        updateType: OCPP20UpdateEnumType.Full,
        versionNumber: 3,
      })

      assert.strictEqual(response.status, OCPP20SendLocalListStatusEnumType.Accepted)
    })
  })
})
