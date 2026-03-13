/**
 * @file Tests for ChargingStationWorkerBroadcastChannel
 * @description Verifies OCPP 2.0.1 UIService pipeline integration: enums, mappings,
 * response status logic, payload building, and handler routing for the 8 new broadcast
 * channel procedures. 59 tests across 7 groups.
 */

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'

import { ChargingStationWorkerBroadcastChannel } from '../../../src/charging-station/broadcast-channel/ChargingStationWorkerBroadcastChannel.js'
import { AbstractUIService } from '../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequestPayload,
  GenericStatus,
  GetCertificateStatusEnumType,
  Iso15118EVCertificateStatusEnumType,
  OCPP20AuthorizationStatusEnumType,
  OCPP20RequestCommand,
  OCPPVersion,
  ProcedureName,
  RequestCommand,
  ResponseStatus,
} from '../../../src/types/index.js'
import { Constants } from '../../../src/utils/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'
import {
  createMockStationWithRequestTracking,
  createOCPP20RequestTestContext,
} from '../ocpp/2.0/OCPP20TestUtils.js'

// ============================================================================
// Testable Interfaces
// ============================================================================
// Type-safe access to private/protected members for testing, following the
// pattern from OCPP20TestUtils.ts to avoid `as any` casts.
// ============================================================================

type CommandHandler = (
  requestPayload?: BroadcastChannelRequestPayload
) => Promise<unknown> | undefined

/**
 * Interface exposing protected static members of AbstractUIService for testing.
 */
interface TestableAbstractUIService {
  ProcedureNameToBroadCastChannelProcedureNameMapping: Map<
    ProcedureName,
    BroadcastChannelProcedureName
  >
}

interface TestableWorkerBroadcastChannel {
  commandHandler: (
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
  ) => Promise<unknown>
  commandHandlers: Map<BroadcastChannelProcedureName, CommandHandler>
  commandResponseToResponseStatus: (
    command: BroadcastChannelProcedureName,
    commandResponse: unknown
  ) => ResponseStatus
  requestHandler: (messageEvent: { data: unknown }) => void
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
    commandHandler: testable.commandHandler.bind(instance),
    commandHandlers: testable.commandHandlers,
    commandResponseToResponseStatus: testable.commandResponseToResponseStatus.bind(instance),
    requestHandler: testable.requestHandler.bind(instance),
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
  // Group 1: ProcedureName enum — 8 new OCPP 2.0.1 entries (8 tests)
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
      assert.strictEqual(ProcedureName.NOTIFY_CUSTOMER_INFORMATION, 'notifyCustomerInformation')
    })

    await it('should have NOTIFY_REPORT in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.NOTIFY_REPORT, 'notifyReport')
    })

    await it('should have SECURITY_EVENT_NOTIFICATION in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.SECURITY_EVENT_NOTIFICATION, 'securityEventNotification')
    })

    await it('should have SIGN_CERTIFICATE in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.SIGN_CERTIFICATE, 'signCertificate')
    })

    await it('should have TRANSACTION_EVENT in ProcedureName enum', () => {
      assert.strictEqual(ProcedureName.TRANSACTION_EVENT, 'transactionEvent')
    })
  })

  // ==========================================================================
  // Group 2: BroadcastChannelProcedureName enum — 8 new OCPP 2.0.1 entries (8 tests)
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
      assert.strictEqual(BroadcastChannelProcedureName.TRANSACTION_EVENT, 'transactionEvent')
    })
  })

  // ==========================================================================
  // Group 3: ProcedureNameToBroadCastChannelProcedureNameMapping — 8 new entries (8 tests)
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
  // Group 4: commandResponseToResponseStatus — 4 new command response cases (18 tests)
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
        { exiResponse: 'base64Data', status: Iso15118EVCertificateStatusEnumType.Accepted }
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
        { exiResponse: 'base64Data', status: Iso15118EVCertificateStatusEnumType.Failed }
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

    // -- Fire-and-forget commands (empty response = SUCCESS) --

    await it('should return SUCCESS for LOG_STATUS_NOTIFICATION with empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
        {}
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for LOG_STATUS_NOTIFICATION with non-empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
        { unexpected: 'field' }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })

    await it('should return SUCCESS for NOTIFY_CUSTOMER_INFORMATION with empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
        {}
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for NOTIFY_CUSTOMER_INFORMATION with non-empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
        { unexpected: 'field' }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })

    await it('should return SUCCESS for NOTIFY_REPORT with empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.NOTIFY_REPORT,
        {}
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for NOTIFY_REPORT with non-empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.NOTIFY_REPORT,
        { unexpected: 'field' }
      )

      assert.strictEqual(status, ResponseStatus.FAILURE)
    })

    await it('should return SUCCESS for SECURITY_EVENT_NOTIFICATION with empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
        {}
      )

      assert.strictEqual(status, ResponseStatus.SUCCESS)
    })

    await it('should return FAILURE for SECURITY_EVENT_NOTIFICATION with non-empty response', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      const status = testable.commandResponseToResponseStatus(
        BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
        { unexpected: 'field' }
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
  // Group 5: buildRequestPayload — OCPP 2.0.1 certificate passthrough (3 tests)
  // ==========================================================================

  await describe('buildRequestPayload OCPP 2.0.1 certificate passthrough', async () => {
    await it('should build GET_15118_EV_CERTIFICATE payload as passthrough', () => {
      const { station, testableRequestService } = createOCPP20RequestTestContext()
      const commandParams = {
        action: 'Install',
        exiRequest: 'base64EncodedData',
        iso15118SchemaVersion: 'urn:iso:15118:2:2013:MsgDef',
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.GET_15118_EV_CERTIFICATE,
        commandParams
      )

      assert.deepStrictEqual(payload, commandParams)
    })

    await it('should build GET_CERTIFICATE_STATUS payload as passthrough', () => {
      const { station, testableRequestService } = createOCPP20RequestTestContext()
      const commandParams = {
        ocspRequestData: {
          hashAlgorithm: 'SHA256',
          issuerKeyHash: 'abc123def456issuerkeyhash',
          issuerNameHash: 'abc123def456issuernamehash',
          responderURL: 'http://ocsp.example.com',
          serialNumber: '1234567890',
        },
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.GET_CERTIFICATE_STATUS,
        commandParams
      )

      assert.deepStrictEqual(payload, commandParams)
    })

    await it('should build SIGN_CERTIFICATE payload as passthrough', () => {
      const { station, testableRequestService } = createOCPP20RequestTestContext()
      const commandParams = {
        csr: '-----BEGIN CERTIFICATE REQUEST-----\nMIIBkTCB...\n-----END CERTIFICATE REQUEST-----',
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.SIGN_CERTIFICATE,
        commandParams
      )

      assert.deepStrictEqual(payload, commandParams)
    })
  })

  // ==========================================================================
  // Group 6: commandHandler dispatch pipeline — verify full dispatch (8 tests)
  // ==========================================================================

  await describe('commandHandler OCPP 2.0.1 dispatch pipeline', async () => {
    await it('should dispatch GET_15118_EV_CERTIFICATE through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.GET_15118_EV_CERTIFICATE)
    })

    await it('should dispatch GET_CERTIFICATE_STATUS through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.GET_CERTIFICATE_STATUS)
    })

    await it('should dispatch LOG_STATUS_NOTIFICATION through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.LOG_STATUS_NOTIFICATION)
    })

    await it('should dispatch NOTIFY_CUSTOMER_INFORMATION through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.NOTIFY_CUSTOMER_INFORMATION)
    })

    await it('should dispatch NOTIFY_REPORT through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.NOTIFY_REPORT, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.NOTIFY_REPORT)
    })

    await it('should dispatch SECURITY_EVENT_NOTIFICATION through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.SECURITY_EVENT_NOTIFICATION)
    })

    await it('should dispatch SIGN_CERTIFICATE through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.SIGN_CERTIFICATE, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.SIGN_CERTIFICATE)
    })

    await it('should dispatch TRANSACTION_EVENT through commandHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      await testable.commandHandler(BroadcastChannelProcedureName.TRANSACTION_EVENT, {})

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.TRANSACTION_EVENT)
    })
  })

  // ==========================================================================
  // Group 7: requestHandler full pipeline — exercise handler dispatch via message events (6 tests)
  // ==========================================================================

  await describe('requestHandler full pipeline OCPP 2.0.1', async () => {
    await it('should dispatch GET_15118_EV_CERTIFICATE via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
          { hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.GET_15118_EV_CERTIFICATE)
    })

    await it('should dispatch LOG_STATUS_NOTIFICATION via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
          { hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.LOG_STATUS_NOTIFICATION)
    })

    await it('should dispatch NOTIFY_CUSTOMER_INFORMATION via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
          { hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.NOTIFY_CUSTOMER_INFORMATION)
    })

    await it('should dispatch NOTIFY_REPORT via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.NOTIFY_REPORT,
          { hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.NOTIFY_REPORT)
    })

    await it('should dispatch SECURITY_EVENT_NOTIFICATION via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
          { hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.SECURITY_EVENT_NOTIFICATION)
    })

    await it('should dispatch METER_VALUES for OCPP 2.0.1 via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.METER_VALUES,
          { hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.METER_VALUES)
    })
  })
})
