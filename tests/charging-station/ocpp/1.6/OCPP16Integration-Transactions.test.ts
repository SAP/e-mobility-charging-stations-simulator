/**
 * @file Tests for OCPP 1.6 integration — Transaction lifecycle
 * @module OCPP 1.6 — §5.11 RemoteStartTransaction, §5.12 RemoteStopTransaction,
 *   §5.14 StartTransaction (response), §5.16 StopTransaction (response)
 * @description Multi-step integration tests crossing IncomingRequestService, RequestService,
 * and ResponseService boundaries for the OCPP 1.6 transaction lifecycle.
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { TestableOCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'
import type { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import type {
  RemoteStartTransactionRequest,
  RemoteStopTransactionRequest,
} from '../../../../src/types/ocpp/1.6/Requests.js'
import type {
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
} from '../../../../src/types/ocpp/1.6/Transaction.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'
import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import { OCPP16ResponseService as OCPP16ResponseServiceClass } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import {
  AvailabilityType,
  GenericStatus,
  OCPP16ChargePointStatus,
  OCPP16MeterValueUnit,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { OCPP16RequestCommand } from '../../../../src/types/ocpp/1.6/Requests.js'
import { OCPP16AuthorizationStatus } from '../../../../src/types/ocpp/1.6/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/**
 * Creates a shared station configured for cross-service integration tests,
 * along with both IncomingRequest and Response service contexts.
 * @returns Integration context with station, testable incoming request service, and response service
 */
function createIntegrationContext (): {
  responseService: OCPP16ResponseService
  station: ChargingStation
  testableService: TestableOCPP16IncomingRequestService
} {
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 2,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: () => Promise.resolve({}),
    },
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_16,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  // IncomingRequest service (handles RemoteStart/Stop from CSMS)
  const incomingRequestService = new OCPP16IncomingRequestService()
  const testableService = createTestableIncomingRequestService(incomingRequestService)

  // Response service (handles StartTransaction/StopTransaction responses from CSMS)
  const responseService = new OCPP16ResponseServiceClass()

  // Mock meter value start/stop to avoid real timer setup
  station.startMeterValues = (_connectorId: number, _interval: number) => {
    /* noop */
  }
  station.stopMeterValues = (_connectorId: number) => {
    /* noop */
  }

  // Add MeterValues template required by buildTransactionBeginMeterValue
  for (const [connectorId] of station.connectors) {
    if (connectorId > 0) {
      const connector = station.getConnectorStatus(connectorId)
      if (connector != null) {
        connector.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
      }
    }
  }

  return { responseService, station, testableService }
}

await describe('OCPP16 Integration — Transaction Lifecycle', async () => {
  let station: ChargingStation
  let testableService: TestableOCPP16IncomingRequestService
  let responseService: OCPP16ResponseService

  beforeEach(() => {
    const ctx = createIntegrationContext()
    station = ctx.station
    testableService = ctx.testableService
    responseService = ctx.responseService
  })

  afterEach(() => {
    standardCleanup()
  })

  // ─── Happy path: RemoteStart → StartTransaction → StopTransaction ────

  await it('should complete full transaction lifecycle: RemoteStart → StartTransaction accepted → StopTransaction', async () => {
    const connectorId = 1
    const transactionId = 42
    const idTag = 'TEST-TAG-001'

    // Step 1: RemoteStartTransaction — CSMS asks station to start charging
    const remoteStartRequest: RemoteStartTransactionRequest = {
      connectorId,
      idTag,
    }
    const remoteStartResponse = await testableService.handleRequestRemoteStartTransaction(
      station,
      remoteStartRequest
    )

    expect(remoteStartResponse.status).toBe(GenericStatus.Accepted)

    // Step 2: StartTransaction response — CSMS accepts the transaction
    const startTxRequest: OCPP16StartTransactionRequest = {
      connectorId,
      idTag,
      meterStart: 0,
      timestamp: new Date(),
    }
    const startTxResponse: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      transactionId,
    }

    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      startTxResponse,
      startTxRequest
    )

    // Verify connector state after StartTransaction accepted
    const connectorAfterStart = station.getConnectorStatus(connectorId)
    expect(connectorAfterStart?.transactionStarted).toBe(true)
    expect(connectorAfterStart?.transactionId).toBe(transactionId)
    expect(connectorAfterStart?.transactionIdTag).toBe(idTag)

    // Step 3: StopTransaction response — transaction ends
    const stopTxRequest: OCPP16StopTransactionRequest = {
      meterStop: 1000,
      timestamp: new Date(),
      transactionId,
    }
    const stopTxResponse: OCPP16StopTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
    }

    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.STOP_TRANSACTION,
      stopTxResponse,
      stopTxRequest
    )

    // Verify connector state is reset after StopTransaction
    const connectorAfterStop = station.getConnectorStatus(connectorId)
    expect(connectorAfterStop?.transactionStarted).toBe(false)
    expect(connectorAfterStop?.transactionId).toBe(undefined)
    expect(connectorAfterStop?.transactionIdTag).toBe(undefined)
  })

  // ─── Remote stop path ────────────────────────────────────────────────

  await it('should accept RemoteStopTransaction for an active transaction', () => {
    const connectorId = 1
    const transactionId = 100

    // Arrange: set up an active transaction using lifecycle helper
    setupConnectorWithTransaction(station, connectorId, { transactionId })

    // Act: RemoteStopTransaction
    const remoteStopRequest: RemoteStopTransactionRequest = {
      transactionId,
    }
    const remoteStopResponse = testableService.handleRequestRemoteStopTransaction(
      station,
      remoteStopRequest
    )

    // Assert: remote stop is accepted
    expect(remoteStopResponse.status).toBe(GenericStatus.Accepted)
  })

  await it('should reject RemoteStopTransaction for a non-existing transaction', () => {
    // Act: RemoteStopTransaction with unknown transactionId
    const remoteStopRequest: RemoteStopTransactionRequest = {
      transactionId: 999,
    }
    const remoteStopResponse = testableService.handleRequestRemoteStopTransaction(
      station,
      remoteStopRequest
    )

    // Assert: remote stop is rejected
    expect(remoteStopResponse.status).toBe(GenericStatus.Rejected)
  })

  // ─── Authorization failure path ──────────────────────────────────────

  await it('should reject RemoteStartTransaction when connector is unavailable and verify no transaction started', async () => {
    const connectorId = 1

    // Arrange: make connector unavailable
    const connectorStatus = station.getConnectorStatus(connectorId)
    if (connectorStatus != null) {
      connectorStatus.availability = AvailabilityType.Inoperative
    }

    // Act
    const request: RemoteStartTransactionRequest = {
      connectorId,
      idTag: 'TEST-TAG-001',
    }
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert: rejected, no transaction started
    expect(response.status).toBe(GenericStatus.Rejected)
    expect(connectorStatus?.transactionStarted).toBe(false)
    expect(connectorStatus?.transactionId).toBe(undefined)
  })

  // ─── Transaction rejection path ──────────────────────────────────────

  await it('should reset connector when StartTransaction response has Blocked status', async () => {
    const connectorId = 1

    // Arrange
    const startTxRequest: OCPP16StartTransactionRequest = {
      connectorId,
      idTag: 'BLOCKED-TAG',
      meterStart: 0,
      timestamp: new Date(),
    }
    const startTxResponse: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.BLOCKED },
      transactionId: 99,
    }

    // Act
    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      startTxResponse,
      startTxRequest
    )

    // Assert: connector should be reset, no active transaction
    const connector = station.getConnectorStatus(connectorId)
    expect(connector?.transactionStarted).toBe(false)
    expect(connector?.transactionId).toBe(undefined)
  })

  // ─── State consistency ───────────────────────────────────────────────

  await it('should return connector to Available status after full transaction cycle', async () => {
    const connectorId = 1
    const transactionId = 55
    const idTag = 'TEST-TAG-002'

    // Verify initial state
    const connectorBefore = station.getConnectorStatus(connectorId)
    expect(connectorBefore?.status).toBe(OCPP16ChargePointStatus.Available)

    // Step 1: RemoteStart accepted
    const remoteStartResponse = await testableService.handleRequestRemoteStartTransaction(
      station,
      { connectorId, idTag }
    )
    expect(remoteStartResponse.status).toBe(GenericStatus.Accepted)

    // Step 2: StartTransaction accepted — connector moves to Charging
    const startTxRequest: OCPP16StartTransactionRequest = {
      connectorId,
      idTag,
      meterStart: 0,
      timestamp: new Date(),
    }
    const startTxResponse: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      transactionId,
    }

    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      startTxResponse,
      startTxRequest
    )

    const connectorDuringTx = station.getConnectorStatus(connectorId)
    expect(connectorDuringTx?.transactionStarted).toBe(true)
    expect(connectorDuringTx?.status).toBe(OCPP16ChargePointStatus.Charging)

    // Step 3: StopTransaction — connector returns to Available
    const stopTxRequest: OCPP16StopTransactionRequest = {
      meterStop: 5000,
      timestamp: new Date(),
      transactionId,
    }
    const stopTxResponse: OCPP16StopTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
    }

    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.STOP_TRANSACTION,
      stopTxResponse,
      stopTxRequest
    )

    // Verify: connector is back to Available with no active transaction
    const connectorAfter = station.getConnectorStatus(connectorId)
    expect(connectorAfter?.status).toBe(OCPP16ChargePointStatus.Available)
    expect(connectorAfter?.transactionStarted).toBe(false)
    expect(connectorAfter?.transactionId).toBe(undefined)
    expect(connectorAfter?.transactionIdTag).toBe(undefined)
  })

  // ─── Cross-service: RemoteStop with active transaction ───────────────

  await it('should accept RemoteStop then complete StopTransaction lifecycle for active transaction', async () => {
    const connectorId = 1
    const transactionId = 200
    const idTag = 'TEST-TAG-003'

    // Arrange: start a full transaction via response service
    const startTxRequest: OCPP16StartTransactionRequest = {
      connectorId,
      idTag,
      meterStart: 0,
      timestamp: new Date(),
    }
    const startTxResponse: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
      transactionId,
    }

    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      startTxResponse,
      startTxRequest
    )

    // Verify transaction is active
    const connectorDuring = station.getConnectorStatus(connectorId)
    expect(connectorDuring?.transactionStarted).toBe(true)
    expect(connectorDuring?.transactionId).toBe(transactionId)

    // Act: RemoteStopTransaction via incoming request service
    const remoteStopResponse = testableService.handleRequestRemoteStopTransaction(station, {
      transactionId,
    })
    expect(remoteStopResponse.status).toBe(GenericStatus.Accepted)

    // Act: Complete the stop via response service
    const stopTxRequest: OCPP16StopTransactionRequest = {
      meterStop: 3000,
      timestamp: new Date(),
      transactionId,
    }
    const stopTxResponse: OCPP16StopTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
    }

    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.STOP_TRANSACTION,
      stopTxResponse,
      stopTxRequest
    )

    // Assert: connector fully reset
    const connectorAfter = station.getConnectorStatus(connectorId)
    expect(connectorAfter?.transactionStarted).toBe(false)
    expect(connectorAfter?.transactionId).toBe(undefined)
    expect(connectorAfter?.status).toBe(OCPP16ChargePointStatus.Available)
  })
})
