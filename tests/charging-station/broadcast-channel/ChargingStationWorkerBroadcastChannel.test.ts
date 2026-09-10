/**
 * @file Tests for ChargingStationWorkerBroadcastChannel
 * @description Verifies OCPP 2.0.1 UIService pipeline integration: mappings,
 * response status logic, payload building, and handler routing for the 8 new broadcast
 * channel procedures.
 */

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, it, mock } from 'node:test'

import { ChargingStationWorkerBroadcastChannel } from '../../../src/charging-station/broadcast-channel/ChargingStationWorkerBroadcastChannel.js'
import { OCPP16ServiceUtils } from '../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { stopRunningTransactions } from '../../../src/charging-station/ocpp/OCPPServiceOperations.js'
import { AbstractUIService } from '../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'
import { BaseError, OCPPError } from '../../../src/exception/index.js'
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequestPayload,
  ConfigurationStatus,
  ErrorType,
  GenericStatus,
  GetCertificateStatusEnumType,
  Iso15118EVCertificateStatusEnumType,
  MeterValueMeasurand,
  OCPP16AuthorizationStatus,
  OCPP16MeterValueFormat,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  type OCPP16StartTransactionRequest,
  OCPP16StopTransactionReason,
  type OCPP16StopTransactionRequest,
  OCPP16VendorParametersKey,
  OCPP20AuthorizationStatusEnumType,
  OCPP20ComponentName,
  OCPP20RequiredVariableName,
  OCPPVersion,
  ProcedureName,
  RequestCommand,
  ResponseStatus,
} from '../../../src/types/index.js'
import { Constants } from '../../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../helpers/TestLifecycleHelpers.js'
import { TEST_PUBLIC_KEY_HEX, TEST_TRANSACTION_ID_STRING } from '../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../helpers/StationHelpers.js'
import {
  createMeterValuesTemplate,
  setMockRequestHandler,
  upsertConfigurationKey,
} from '../ocpp/1.6/OCPP16TestUtils.js'
import { createMockStationWithRequestTracking } from '../ocpp/2.0/OCPP20TestUtils.js'

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
  // Group 1: ProcedureNameToBroadCastChannelProcedureNameMapping — 8 new entries
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
  // Group 2: commandResponseToResponseStatus — 4 new command response cases
  // ==========================================================================

  await describe('commandResponseToResponseStatus OCPP 2.0.1 commands', async () => {
    // -- SIGN_CERTIFICATE --

    await it('should return SUCCESS for SIGN_CERTIFICATE with Accepted status', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
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
  // Group 3: CHANGE_CONFIGURATION — status collapse + worker handler
  // The status-collapse tests guard the acceptedStatusCommands entry: without it,
  // even ACCEPTED would fall through to the FAILURE default.
  // ==========================================================================

  await describe('commandResponseToResponseStatus CHANGE_CONFIGURATION', async () => {
    const cases: { expected: ResponseStatus; status: ConfigurationStatus }[] = [
      { expected: ResponseStatus.SUCCESS, status: ConfigurationStatus.ACCEPTED },
      { expected: ResponseStatus.SUCCESS, status: ConfigurationStatus.REBOOT_REQUIRED },
      { expected: ResponseStatus.FAILURE, status: ConfigurationStatus.REJECTED },
      { expected: ResponseStatus.FAILURE, status: ConfigurationStatus.NOT_SUPPORTED },
    ]
    for (const { expected, status } of cases) {
      await it(`should map ${status} to ${expected}`, () => {
        const { station } = createMockChargingStation({
          connectorsCount: 1,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        instance = new ChargingStationWorkerBroadcastChannel(station)
        const testable = createTestableWorkerBroadcastChannel(instance)

        assert.strictEqual(
          testable.commandResponseToResponseStatus(
            BroadcastChannelProcedureName.CHANGE_CONFIGURATION,
            { status }
          ),
          expected
        )
      })
    }
  })

  await describe('START_TRANSACTION handler', async () => {
    await it('should let stop await a worker StartTransaction before sending StopTransaction', async () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      const startResponseGate = Promise.withResolvers<undefined>()
      const startRequestStarted = Promise.withResolvers<undefined>()
      const commands: RequestCommand[] = []
      setMockRequestHandler(station, async (...args: unknown[]) => {
        const command = args[1] as RequestCommand
        commands.push(command)
        if (command === RequestCommand.START_TRANSACTION) {
          startRequestStarted.resolve(undefined)
          await startResponseGate.promise
          connectorStatus.transactionStarted = true
          connectorStatus.transactionId = 91
          return { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
        }
        if (command === RequestCommand.STOP_TRANSACTION) {
          return { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
        }
        return {}
      })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.START_TRANSACTION
      )
      assert.ok(handler != null)

      const startPromise = handler({ connectorId: 1, idTag: 'WORKER-ID-TAG' })
      assert.ok(startPromise != null)
      await startRequestStarted.promise
      const stopPromise = stopRunningTransactions(station)
      await flushMicrotasks()

      assert.deepStrictEqual(commands, [RequestCommand.START_TRANSACTION])
      startResponseGate.resolve(undefined)
      await Promise.all([startPromise, stopPromise])
      assert.deepStrictEqual(commands, [
        RequestCommand.START_TRANSACTION,
        RequestCommand.STATUS_NOTIFICATION,
        RequestCommand.STOP_TRANSACTION,
      ])
    })

    await it('should preserve optional StartTransaction payload fields through tracked routing', async () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      const timestamp = new Date('2026-01-02T03:04:05.000Z')
      const payload: OCPP16StartTransactionRequest = {
        connectorId: 1,
        idTag: 'WORKER-ID-TAG',
        meterStart: 123,
        reservationId: 7,
        timestamp,
      }
      let sentPayload: Partial<OCPP16StartTransactionRequest> | undefined
      setMockRequestHandler(station, (...args: unknown[]) => {
        sentPayload = args[2] as Partial<OCPP16StartTransactionRequest>
        return Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
      })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.START_TRANSACTION
      )
      assert.ok(handler != null)

      await handler(payload)

      assert.deepStrictEqual(sentPayload, payload)
    })
  })

  // CHANGE_CONFIGURATION command handler: payload validation + delegation

  await describe('CHANGE_CONFIGURATION handler', async () => {
    const changePayload = (
      overrides: Partial<BroadcastChannelRequestPayload> = {}
    ): BroadcastChannelRequestPayload => ({ key: 'HeartbeatInterval', value: '60', ...overrides })

    const setup = () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      const changeConfigurationMock = mock.fn(() => ConfigurationStatus.ACCEPTED)
      station.changeConfiguration = changeConfigurationMock
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.CHANGE_CONFIGURATION
      )
      assert.ok(handler != null)
      return { changeConfigurationMock, handler }
    }

    await it('should delegate a valid payload to changeConfiguration and return its status', () => {
      const { changeConfigurationMock, handler } = setup()
      const response = handler(changePayload())
      assert.deepStrictEqual(response, { status: ConfigurationStatus.ACCEPTED })
      assert.strictEqual(changeConfigurationMock.mock.callCount(), 1)
      assert.deepStrictEqual(changeConfigurationMock.mock.calls[0].arguments, [
        'HeartbeatInterval',
        '60',
      ])
    })

    await it('should accept an empty-string value', () => {
      const { changeConfigurationMock, handler } = setup()
      const response = handler(changePayload({ value: '' }))
      assert.deepStrictEqual(response, { status: ConfigurationStatus.ACCEPTED })
      assert.deepStrictEqual(changeConfigurationMock.mock.calls[0].arguments, [
        'HeartbeatInterval',
        '',
      ])
    })

    await it('should throw a BaseError when key is missing', () => {
      const { changeConfigurationMock, handler } = setup()
      assert.throws(() => handler(changePayload({ key: undefined })), BaseError)
      assert.strictEqual(changeConfigurationMock.mock.callCount(), 0)
    })

    await it('should throw a BaseError when key is an empty string', () => {
      const { handler } = setup()
      assert.throws(() => handler(changePayload({ key: '' })), BaseError)
    })

    await it('should throw a BaseError when value is not a string', () => {
      const { changeConfigurationMock, handler } = setup()
      assert.throws(() => handler(changePayload({ value: 42 as unknown as string })), BaseError)
      assert.strictEqual(changeConfigurationMock.mock.callCount(), 0)
    })
  })

  // ==========================================================================
  // Group 4: commandHandler dispatch pipeline — verify full dispatch
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

    await it('should dispatch CLOSE_CONNECTION as a requested (terminal) close', async t => {
      const { station } = createMockStationWithRequestTracking()

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)
      const closeSpy = t.mock.method(station, 'closeWSConnection', () => undefined)

      await testable.commandHandler(BroadcastChannelProcedureName.CLOSE_CONNECTION, {})

      // The UI disconnect must close with byRequest so onClose treats it as
      // terminal and does not auto-reconnect.
      assert.strictEqual(closeSpy.mock.calls.length, 1)
      assert.deepStrictEqual(closeSpy.mock.calls[0].arguments, [{ byRequest: true }])
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

  await describe('STOP_TRANSACTION handler', async () => {
    await it('should preserve valid UI overrides and transport params while using canonical transaction identity and meterStop', async () => {
      const response = { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
      const requestHandler = mock.fn((...args: unknown[]) =>
        Promise.resolve(args[1] === RequestCommand.STOP_TRANSACTION ? response : {})
      )
      const { station } = createMockChargingStation({
        connectorsCount: 2,
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 2, { energyImport: 1234, transactionId: 202 })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)
      const timestamp = '2026-09-08T10:00:00.000Z'
      const transactionData = [{ sampledValue: [], timestamp: new Date(timestamp) }]

      const result = await handler({
        connectorId: 1,
        idTag: 'UI-ID-TAG',
        meterStop: 9999,
        reason: OCPP16StopTransactionReason.EMERGENCY_STOP,
        timestamp,
        transactionData,
        transactionId: 202,
      })

      assert.strictEqual(result, response)
      const stopCall = requestHandler.mock.calls.find(
        call => call.arguments[1] === RequestCommand.STOP_TRANSACTION
      )
      assert.ok(stopCall != null)
      assert.deepStrictEqual(stopCall.arguments[2], {
        idTag: 'UI-ID-TAG',
        meterStop: 1234,
        reason: OCPP16StopTransactionReason.EMERGENCY_STOP,
        timestamp: new Date(timestamp),
        transactionData,
        transactionId: 202,
      })
      const { onError, ...requestOptions } = stopCall.arguments[3] as {
        [key: string]: unknown
        onError?: unknown
      }
      assert.strictEqual(typeof onError, 'function')
      assert.deepStrictEqual(requestOptions, {
        bufferOnErrorDuringStationStop: true,
        rawPayload: true,
        skipBufferingOnError: false,
        throwError: true,
      })
    })

    await it('should normalize a valid UI timestamp before generating and sending signed data', async () => {
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
          ;(args[3] as { onMessageSent?: () => void }).onMessageSent?.()
          return Promise.resolve({
            idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
          })
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
          transactionDataMeterValues: true,
        },
      })
      setupConnectorWithTransaction(station, 1, { energyImport: 1234, transactionId: 606 })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.MeterValues = createMeterValuesTemplate([
        {
          measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: OCPP16MeterValueUnit.WATT_HOUR,
          value: '0',
        },
      ])
      connectorStatus.publicKeySentInTransaction = false
      connectorStatus.transactionBeginMeterValue = {
        sampledValue: [{ value: '0' }],
        timestamp: new Date('2026-09-08T09:00:00.000Z'),
      }
      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
        'OncePerTransaction'
      )
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)
      const timestamp = '2026-09-08T10:00:00.123+02:00'

      await handler({ timestamp, transactionId: 606 })

      assert.ok(stopPayload != null)
      assert.ok(stopPayload.timestamp instanceof Date)
      assert.strictEqual(stopPayload.timestamp.getTime(), new Date(timestamp).getTime())
      const signedSample = stopPayload.transactionData
        ?.flatMap(meterValue => meterValue.sampledValue)
        .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
      assert.ok(signedSample != null)
      const signedMeterValue = JSON.parse(signedSample.value) as {
        publicKey: string
        signedMeterData: string
      }
      assert.notStrictEqual(signedMeterValue.publicKey, '')
      assert.match(
        Buffer.from(signedMeterValue.signedMeterData, 'base64').toString(),
        /2026-09-08T08:00:00.123Z/
      )
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    })

    await it('should default an omitted timestamp and preserve valid Date and RFC3339 instants', async () => {
      const stopTimestamps: Date[] = []
      const requestHandler = mock.fn((...args: unknown[]) => {
        if (args[1] === RequestCommand.STOP_TRANSACTION) {
          stopTimestamps.push((args[2] as OCPP16StopTransactionRequest).timestamp)
        }
        return Promise.resolve({
          idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
        })
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 608 })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)

      const beforeDefault = Date.now()
      await handler({ transactionId: 608 })
      const afterDefault = Date.now()
      assert.ok(stopTimestamps[0] instanceof Date)
      assert.ok(stopTimestamps[0].getTime() >= beforeDefault)
      assert.ok(stopTimestamps[0].getTime() <= afterDefault)

      const dateTimestamp = new Date('2026-09-08T10:00:00.321Z')
      await handler({ timestamp: dateTimestamp, transactionId: 608 })
      assert.notStrictEqual(stopTimestamps[1], dateTimestamp)
      assert.strictEqual(stopTimestamps[1].getTime(), dateTimestamp.getTime())

      const stringTimestamps = [
        ['2026-09-08T10:00:00.123456Z', '2026-09-08T10:00:00.123Z'],
        ['2026-09-08T10:00:00.987+05:30', '2026-09-08T04:30:00.987Z'],
      ] as const
      for (const [timestamp, expectedInstant] of stringTimestamps) {
        await handler({ timestamp, transactionId: 608 })
        assert.strictEqual(stopTimestamps.at(-1)?.toISOString(), expectedInstant)
      }
    })

    await it('should reject invalid explicit UI timestamps before any transaction mutation', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 607 })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.publicKeySentInTransaction = false
      connectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(
        () => undefined,
        60_000
      )
      const activeTimer = connectorStatus.transactionUpdatedMeterValuesSetInterval
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)
      const invalidTimestamps: unknown[] = [
        null,
        undefined,
        0,
        'not-an-ISO-timestamp',
        '2026-09-08T10:00:00',
        '2026-02-30T10:00:00Z',
        '2026-09-08T24:00:00Z',
        '2026-09-08T10:00:00+24:00',
        new Date(Number.NaN),
      ]

      for (const timestamp of invalidTimestamps) {
        await assert.rejects(
          async () =>
            await handler({
              timestamp,
              transactionId: 607,
            } as unknown as BroadcastChannelRequestPayload),
          (error: Error) => {
            assert.ok(error instanceof OCPPError)
            assert.strictEqual(error.code, ErrorType.FORMAT_VIOLATION)
            return true
          }
        )
      }

      assert.strictEqual(requestHandler.mock.callCount(), 0)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, activeTimer)
    })

    await it('should reject OCPP 2.x before transaction lookup and preserve active timers', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()
      setupConnectorWithTransaction(station, 1, { transactionId: 609 })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(
        () => undefined,
        60_000
      )
      connectorStatus.transactionEndedMeterValuesSetInterval = setInterval(() => undefined, 60_000)
      const updatedTimer = connectorStatus.transactionUpdatedMeterValuesSetInterval
      const endedTimer = connectorStatus.transactionEndedMeterValuesSetInterval
      const transactionLookup = mock.method(station, 'getConnectorIdByTransactionId', () => 1)
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)

      await assert.rejects(
        async () => await handler({ transactionId: 609 }),
        (error: Error) => error instanceof BaseError && error.message.includes('OCPP 1.6')
      )

      assert.strictEqual(transactionLookup.mock.callCount(), 0)
      assert.strictEqual(sentRequests.length, 0)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, updatedTimer)
      assert.strictEqual(connectorStatus.transactionEndedMeterValuesSetInterval, endedTimer)
    })

    await it('should join an overlapping station stop and return the exact same wire response', async () => {
      const stopRequestStarted = Promise.withResolvers<undefined>()
      const stopResponse = Promise.withResolvers<{
        idTagInfo: { status: OCPP16AuthorizationStatus }
      }>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === RequestCommand.STOP_TRANSACTION) {
          stopRequestStarted.resolve(undefined)
          return await stopResponse.promise
        }
        return {}
      })
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        started: true,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 303 })
      let stationStopResult: unknown
      station.stop = async () => {
        stationStopResult = await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      }
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)
      const stopStationHandler = testable.commandHandlers.get(
        BroadcastChannelProcedureName.STOP_CHARGING_STATION
      )
      const stopTransactionHandler = testable.commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(stopStationHandler != null)
      assert.ok(stopTransactionHandler != null)

      const stationStop = stopStationHandler({})
      await stopRequestStarted.promise
      const uiStop = stopTransactionHandler({ transactionId: 303 })
      const expectedResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }
      stopResponse.resolve(expectedResponse)
      const uiStopResult = await uiStop
      await stationStop

      assert.strictEqual(uiStopResult, expectedResponse)
      assert.strictEqual(stationStopResult, expectedResponse)
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )
    })

    await it('should reject a UI join when a station-initiated StopTransaction fails', async () => {
      const stopRequestStarted = Promise.withResolvers<undefined>()
      const stopResponse = Promise.withResolvers<unknown>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === RequestCommand.STOP_TRANSACTION) {
          stopRequestStarted.resolve(undefined)
          return await stopResponse.promise
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 404 })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)

      const stationStop = OCPP16ServiceUtils.stopTransactionOnConnector(
        station,
        1,
        undefined,
        {},
        { responseTimeoutMs: 50, throwError: false }
      )
      await stopRequestStarted.promise
      const uiStop = handler({ transactionId: 404 })
      const failure = new Error('StopTransaction delivery failed')
      stopResponse.reject(failure)
      const results = await Promise.allSettled([stationStop, uiStop])

      assert.deepStrictEqual(
        results.map(result => result.status),
        ['rejected', 'rejected']
      )
      assert.ok(results.every(result => result.status === 'rejected' && result.reason === failure))
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )
      const stopCall = requestHandler.mock.calls.find(
        call => call.arguments[1] === RequestCommand.STOP_TRANSACTION
      )
      const { onError, ...requestOptions } = stopCall?.arguments[3] as {
        [key: string]: unknown
        onError?: unknown
      }
      assert.strictEqual(typeof onError, 'function')
      assert.deepStrictEqual(requestOptions, {
        bufferOnErrorDuringStationStop: true,
        rawPayload: true,
        responseTimeoutMs: 50,
        skipBufferingOnError: false,
        throwError: true,
      })
    })

    await it('should coalesce overlapping remote and UI stops before Finishing completes', async () => {
      const statusRequestStarted = Promise.withResolvers<undefined>()
      const statusResponse = Promise.withResolvers<unknown>()
      const stopRequestStarted = Promise.withResolvers<undefined>()
      const stopResponse = Promise.withResolvers<{
        idTagInfo: { status: OCPP16AuthorizationStatus }
      }>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === RequestCommand.STATUS_NOTIFICATION) {
          statusRequestStarted.resolve(undefined)
          return await statusResponse.promise
        }
        if (args[1] === RequestCommand.STOP_TRANSACTION) {
          stopRequestStarted.resolve(undefined)
          return await stopResponse.promise
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 505 })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)

      const remoteStop = OCPP16ServiceUtils.remoteStopTransaction(station, 1)
      await statusRequestStarted.promise
      const uiStop = handler({ transactionId: 505 })

      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === RequestCommand.STATUS_NOTIFICATION
        ).length,
        1
      )
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === RequestCommand.STOP_TRANSACTION
        ).length,
        0
      )

      statusResponse.resolve({})
      await stopRequestStarted.promise
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )
      const expectedResponse = {
        idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      }
      stopResponse.resolve(expectedResponse)

      assert.strictEqual(await uiStop, expectedResponse)
      assert.deepStrictEqual(await remoteStop, { status: GenericStatus.Accepted })
    })

    await it('should reject a missing transactionId with a typed error before sending', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)

      await assert.rejects(async () => {
        await handler({})
      }, BaseError)
      assert.strictEqual(requestHandler.mock.callCount(), 0)
    })

    await it('should reject an unknown transactionId with a typed error before sending', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const handler = createTestableWorkerBroadcastChannel(instance).commandHandlers.get(
        BroadcastChannelProcedureName.STOP_TRANSACTION
      )
      assert.ok(handler != null)

      await assert.rejects(
        async () => {
          await handler({ transactionId: 404 })
        },
        (error: Error) => error instanceof BaseError && error.message.includes("'404'")
      )
      assert.strictEqual(requestHandler.mock.callCount(), 0)
    })
  })

  // ==========================================================================
  // Group 5: requestHandler full pipeline — exercise handler dispatch via message events
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

      await flushMicrotasks()

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

      await flushMicrotasks()

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

      await flushMicrotasks()

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

      await flushMicrotasks()

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

      await flushMicrotasks()

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.SECURITY_EVENT_NOTIFICATION)
    })

    await it('should dispatch METER_VALUES for OCPP 2.0.1 via requestHandler', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()

      // Add MeterValues template to connector 1 so buildMeterValue can construct a valid payload
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [
          {
            measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: 0,
          },
        ]
        connectorStatus.transactionId = TEST_TRANSACTION_ID_STRING
      }

      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.METER_VALUES,
          { connectorId: 1, hashIds: [station.stationInfo?.hashId] },
        ],
      })

      await flushMicrotasks()

      assert.strictEqual(sentRequests.length, 1)
      assert.strictEqual(sentRequests[0].command, RequestCommand.METER_VALUES)
      assert.strictEqual('connectorId' in sentRequests[0].payload, false)
      assert.ok(
        sentRequests[0].payload.evseId != null,
        'OCPP 2.0.1 meter values payload should contain evseId'
      )
      assert.ok(
        Array.isArray(sentRequests[0].payload.meterValue),
        'OCPP 2.0.1 meter values payload should contain meterValue array'
      )
    })
    await it('should route an EVSE-only meter request to its active connector', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()
      const evseStatus = station.getEvseStatus(1)
      const connector1 = station.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connector1 != null)
      connector1.transactionId = undefined
      connector1.transactionStarted = false
      const connector2 = {
        ...connector1,
        energyActiveImportRegisterValue: 222,
        transactionEnergyActiveImportRegisterValue: 222,
        transactionId: 'tx-active-connector-2',
        transactionStarted: true,
      }
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: 222,
        },
      ]
      evseStatus.connectors.set(2, connector2)
      upsertConfigurationKey(
        station,
        `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`,
        MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.METER_VALUES,
          { evseId: 1, hashIds: [station.stationInfo?.hashId] },
        ],
      })
      await flushMicrotasks()

      assert.strictEqual(sentRequests.length, 1)
      assert.ok(Array.isArray(sentRequests[0].payload.meterValue))
      assert.ok(sentRequests[0].payload.meterValue.length > 0)
    })

    await it('should preserve a caller-supplied MeterValues payload', async () => {
      const { sentRequests, station } = createMockStationWithRequestTracking()
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: 10,
        },
      ]
      connectorStatus.transactionId = TEST_TRANSACTION_ID_STRING
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      const rawMeterValue = [
        {
          sampledValue: [
            {
              measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
              value: 321,
            },
          ],
          timestamp: new Date(123),
        },
      ]
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)

      testable.requestHandler({
        data: [
          randomUUID(),
          BroadcastChannelProcedureName.METER_VALUES,
          {
            connectorId: 1,
            hashIds: [station.stationInfo?.hashId],
            meterValue: rawMeterValue,
          },
        ],
      })
      await flushMicrotasks()

      assert.strictEqual(sentRequests.length, 1)
      assert.deepStrictEqual(sentRequests[0].payload.meterValue, rawMeterValue)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 0)
    })
  })

  await describe('mapping completeness', async () => {
    const allProcedureNames = new Set(Object.values(ProcedureName))
    const allBroadcastNames = new Set(Object.values(BroadcastChannelProcedureName))
    const UI_ONLY_PROCEDURE_NAMES = new Set<string>([
      ProcedureName.ADD_CHARGING_STATIONS,
      ProcedureName.LIST_CHARGING_STATIONS,
      ProcedureName.LIST_TEMPLATES,
      ProcedureName.PERFORMANCE_STATISTICS,
      ProcedureName.SIMULATOR_STATE,
      ProcedureName.START_SIMULATOR,
      ProcedureName.STOP_SIMULATOR,
    ])

    await it('should have a matching ProcedureName for every BroadcastChannelProcedureName', () => {
      const missing = [...allBroadcastNames].filter(
        name => !allProcedureNames.has(name as unknown as ProcedureName)
      )
      assert.deepStrictEqual(missing, [])
    })

    await it('should have a matching BroadcastChannelProcedureName for every non-UI-only ProcedureName', () => {
      const missing = [...allProcedureNames].filter(
        name =>
          !UI_ONLY_PROCEDURE_NAMES.has(name) &&
          !allBroadcastNames.has(name as unknown as BroadcastChannelProcedureName)
      )
      assert.deepStrictEqual(missing, [])
    })

    await it('should not have any ProcedureName classified as both UI-only and broadcast-capable', () => {
      const overlap = [...UI_ONLY_PROCEDURE_NAMES].filter(name =>
        allBroadcastNames.has(name as unknown as BroadcastChannelProcedureName)
      )
      assert.deepStrictEqual(overlap, [])
    })

    await it('should have a ProcedureNameToBroadCastChannelProcedureNameMapping entry for every BroadcastChannelProcedureName', () => {
      const mapping = getProcedureNameMapping()
      const mappedBroadcastNames = new Set(mapping.values())
      const missing = [...allBroadcastNames].filter(name => !mappedBroadcastNames.has(name))
      assert.deepStrictEqual(missing, [])
    })

    await it('should have a commandHandler for every BroadcastChannelProcedureName', () => {
      const { station } = createMockChargingStation()
      instance = new ChargingStationWorkerBroadcastChannel(station)
      const testable = createTestableWorkerBroadcastChannel(instance)
      const missing = [...allBroadcastNames].filter(name => !testable.commandHandlers.has(name))
      assert.deepStrictEqual(missing, [])
    })
  })
})
