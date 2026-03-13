/**
 * @file Tests for ChargingStationWorkerBroadcastChannel
 * @description Verifies OCPP 2.0.1 UIService pipeline integration: enums, mappings,
 * command handlers, and response status logic for the 8 new broadcast channel procedures.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { ChargingStationWorkerBroadcastChannel } from '../../../src/charging-station/broadcast-channel/ChargingStationWorkerBroadcastChannel.js'
import { AbstractUIService } from '../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequestPayload,
  GenericStatus,
  GetCertificateStatusEnumType,
  Iso15118EVCertificateStatusEnumType,
  OCPPVersion,
  ProcedureName,
  ResponseStatus,
} from '../../../src/types/index.js'
import { OCPP20AuthorizationStatusEnumType } from '../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../src/utils/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

// ============================================================================
// Testable Interfaces
// ============================================================================
// Type-safe access to private/protected members for testing, following the
// pattern from OCPP20TestUtils.ts to avoid `as any` casts.
// ============================================================================

/**
 * Interface exposing protected static members of AbstractUIService for testing.
 */
interface TestableAbstractUIService {
  ProcedureNameToBroadCastChannelProcedureNameMapping: Map<
    ProcedureName,
    BroadcastChannelProcedureName
  >
}

/**
 * Interface exposing private members of ChargingStationWorkerBroadcastChannel for testing.
 */
interface TestableWorkerBroadcastChannel {
  commandHandlers: Map<BroadcastChannelProcedureName, unknown>
  commandResponseToResponseStatus: (
    command: BroadcastChannelProcedureName,
    commandResponse: unknown
  ) => ResponseStatus
}

/**
 * Create a testable wrapper for ChargingStationWorkerBroadcastChannel.
 * @param instance - The instance to wrap
 * @returns Testable interface with access to private members
 */
function createTestableWorkerBroadcastChannel (
  instance: ChargingStationWorkerBroadcastChannel
): TestableWorkerBroadcastChannel {
  const testable = instance as unknown as TestableWorkerBroadcastChannel
  return {
    commandHandlers: testable.commandHandlers,
    commandResponseToResponseStatus: testable.commandResponseToResponseStatus.bind(instance),
  }
}

/**
 * Get the protected static ProcedureNameToBroadCastChannelProcedureNameMapping.
 * @returns The mapping from ProcedureName to BroadcastChannelProcedureName
 */
function getProcedureNameMapping (): Map<ProcedureName, BroadcastChannelProcedureName> {
  return (AbstractUIService as unknown as TestableAbstractUIService)
    .ProcedureNameToBroadCastChannelProcedureNameMapping
}

await describe('ChargingStationWorkerBroadcastChannel', async () => {
  let instance: ChargingStationWorkerBroadcastChannel | undefined

  afterEach(() => {
    if (instance != null) {
      instance.close()
      instance = undefined
    }
    standardCleanup()
  })

  // ==========================================================================
  // Group 1: ProcedureName enum — 8 new OCPP 2.0.1 entries
  // ==========================================================================

  await describe('ProcedureName enum OCPP 2.0.1 entries', async () => {
    await it('should have GET_15118_EV_CERTIFICATE in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.GET_15118_EV_CERTIFICATE, 'get15118EVCertificate')
    })

    await it('should have GET_CERTIFICATE_STATUS in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.GET_CERTIFICATE_STATUS, 'getCertificateStatus')
    })

    await it('should have LOG_STATUS_NOTIFICATION in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.LOG_STATUS_NOTIFICATION, 'logStatusNotification')
    })

    await it('should have NOTIFY_CUSTOMER_INFORMATION in ProcedureName enum', () => {
      assert.strictEqual(
        ProcedureName.NOTIFY_CUSTOMER_INFORMATION,
        'notifyCustomerInformation'
      )
    })

    await it('should have NOTIFY_REPORT in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.NOTIFY_REPORT, 'notifyReport')
    })

    await it('should have SECURITY_EVENT_NOTIFICATION in ProcedureName enum', () => {
      assert.strictEqual(
        ProcedureName.SECURITY_EVENT_NOTIFICATION,
        'securityEventNotification'
      )
    })

    await it('should have SIGN_CERTIFICATE in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.SIGN_CERTIFICATE, 'signCertificate')
    })

    await it('should have TRANSACTION_EVENT in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.TRANSACTION_EVENT, 'transactionEvent')
    })
  })

  // ==========================================================================
  // Group 2: BroadcastChannelProcedureName enum — 8 new OCPP 2.0.1 entries
  // ==========================================================================

  await describe('BroadcastChannelProcedureName enum OCPP 2.0.1 entries', async () => {
    await it('should have GET_15118_EV_CERTIFICATE in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(
        BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
        'get15118EVCertificate'
      )
    })

    await it('should have GET_CERTIFICATE_STATUS in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(
        BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS,
        'getCertificateStatus'
      )
    })

    await it('should have LOG_STATUS_NOTIFICATION in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(
        BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
        'logStatusNotification'
      )
    })

    await it('should have NOTIFY_CUSTOMER_INFORMATION in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(
        BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
        'notifyCustomerInformation'
      )
    })

    await it('should have NOTIFY_REPORT in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(BroadcastChannelProcedureName.NOTIFY_REPORT, 'notifyReport')
    })

    await it('should have SECURITY_EVENT_NOTIFICATION in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(
        BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
        'securityEventNotification'
      )
    })

    await it('should have SIGN_CERTIFICATE in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(BroadcastChannelProcedureName.SIGN_CERTIFICATE, 'signCertificate')
    })

    await it('should have TRANSACTION_EVENT in BroadcastChannelProcedureName enum', () => {
      assert.strictEqual(
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        'transactionEvent'
      )
    })
  })

  // ==========================================================================
  // Group 3: ProcedureNameToBroadCastChannelProcedureNameMapping — 8 new entries
  // ==========================================================================

  await describe('ProcedureNameToBroadCastChannelProcedureNameMapping OCPP 2.0.1 entries', async () => {
    await it('should map GET_15118_EV_CERTIFICATE procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.GET_15118_EV_CERTIFICATE),
        BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE
      )
    })

    await it('should map GET_CERTIFICATE_STATUS procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.GET_CERTIFICATE_STATUS),
        BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS
      )
    })

    await it('should map LOG_STATUS_NOTIFICATION procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.LOG_STATUS_NOTIFICATION),
        BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION
      )
    })

    await it('should map NOTIFY_CUSTOMER_INFORMATION procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.NOTIFY_CUSTOMER_INFORMATION),
        BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION
      )
    })

    await it('should map NOTIFY_REPORT procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.NOTIFY_REPORT),
        BroadcastChannelProcedureName.NOTIFY_REPORT
      )
    })

    await it('should map SECURITY_EVENT_NOTIFICATION procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.SECURITY_EVENT_NOTIFICATION),
        BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION
      )
    })

    await it('should map SIGN_CERTIFICATE procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.SIGN_CERTIFICATE),
        BroadcastChannelProcedureName.SIGN_CERTIFICATE
      )
    })

    await it('should map TRANSACTION_EVENT procedure to broadcast channel procedure', () => {
      const mapping = getProcedureNameMapping()
      assert.strictEqual(
        mapping.get(ProcedureName.TRANSACTION_EVENT),
        BroadcastChannelProcedureName.TRANSACTION_EVENT
      )
    })
  })

  // ==========================================================================
  // Group 4: BroadcastChannelRequestPayload — OCPP 2.0.1 optional fields
  // ==========================================================================

  await describe('BroadcastChannelRequestPayload OCPP 2.0.1 fields', async () => {
    await it('should accept optional OCPP 2.0.1 fields in BroadcastChannelRequestPayload', () => {
      // Type-level test: verify the interface accepts OCPP 2.0.1 fields
      const payload: BroadcastChannelRequestPayload = {
        eventType: 'Started',
        evseId: 1,
        idToken: { idToken: 'test', type: 'Central' },
        transactionData: { transactionId: 'uuid-123' },
      }

      assert.strictEqual(payload.evseId, 1)
      assert.strictEqual(payload.eventType, 'Started')
    })

    await it('should accept BroadcastChannelRequestPayload with only evseId', () => {
      const payload: BroadcastChannelRequestPayload = {
        evseId: 2,
      }

      assert.strictEqual(payload.evseId, 2)
    })

    await it('should accept BroadcastChannelRequestPayload with idToken object', () => {
      const payload: BroadcastChannelRequestPayload = {
        idToken: { idToken: 'RFID_TOKEN_001', type: 'ISO14443' },
      }

      assert.deepStrictEqual(payload.idToken, {
        idToken: 'RFID_TOKEN_001',
        type: 'ISO14443',
      })
    })
  })

  // ==========================================================================
  // Group 5: commandResponseToResponseStatus — 4 new command response cases
  // ==========================================================================

  await describe('commandResponseToResponseStatus OCPP 2.0.1 commands', async () => {
    // -- SIGN_CERTIFICATE --

    await it('should return SUCCESS for SIGN_CERTIFICATE with Accepted status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.SIGN_CERTIFICATE,
        { status: GenericStatus.Accepted }
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for SIGN_CERTIFICATE with Rejected status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.SIGN_CERTIFICATE,
        { status: GenericStatus.Rejected }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })

    // -- GET_15118_EV_CERTIFICATE --

    await it('should return SUCCESS for GET_15118_EV_CERTIFICATE with Accepted status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
        { exiResponse: 'base64data', status: Iso15118EVCertificateStatusEnumType.Accepted }
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for GET_15118_EV_CERTIFICATE with Failed status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
        { exiResponse: 'base64data', status: Iso15118EVCertificateStatusEnumType.Failed }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })

    // -- GET_CERTIFICATE_STATUS --

    await it('should return SUCCESS for GET_CERTIFICATE_STATUS with Accepted status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS,
        { status: GetCertificateStatusEnumType.Accepted }
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for GET_CERTIFICATE_STATUS with Failed status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS,
        { status: GetCertificateStatusEnumType.Failed }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })

    // -- TRANSACTION_EVENT --

    await it('should return SUCCESS for TRANSACTION_EVENT with empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      // isEmpty({}) returns true → SUCCESS
      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        {}
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return SUCCESS for TRANSACTION_EVENT with no idTokenInfo', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      // idTokenInfo == null → SUCCESS
      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        { chargingPriority: 1 }
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return SUCCESS for TRANSACTION_EVENT with Accepted idTokenInfo', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } }
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for TRANSACTION_EVENT with Blocked idTokenInfo', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Blocked } }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })
  })

  // ==========================================================================
  // Group 6: commandHandlers Map — 8 new entries registered
  // ==========================================================================

  await describe('commandHandlers OCPP 2.0.1 entries', async () => {
    await it('should have GET_15118_EV_CERTIFICATE command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(testable.commandHandlers.has(BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE))
    })

    await it('should have GET_CERTIFICATE_STATUS command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(testable.commandHandlers.has(BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS))
    })

    await it('should have LOG_STATUS_NOTIFICATION command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(
        testable.commandHandlers.has(BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION)
      )
    })

    await it('should have NOTIFY_CUSTOMER_INFORMATION command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(
        testable.commandHandlers.has(BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION)
      )
    })

    await it('should have NOTIFY_REPORT command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(testable.commandHandlers.has(BroadcastChannelProcedureName.NOTIFY_REPORT))
    })

    await it('should have SECURITY_EVENT_NOTIFICATION command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(
        testable.commandHandlers.has(BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION)
      )
    })

    await it('should have SIGN_CERTIFICATE command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(testable.commandHandlers.has(BroadcastChannelProcedureName.SIGN_CERTIFICATE))
    })

    await it('should have TRANSACTION_EVENT command handler registered', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      assert.ok(testable.commandHandlers.has(BroadcastChannelProcedureName.TRANSACTION_EVENT))
    })
  })
})
