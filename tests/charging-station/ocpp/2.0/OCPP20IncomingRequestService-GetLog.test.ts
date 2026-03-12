/**
 * @file Tests for OCPP20IncomingRequestService GetLog
 * @description Unit tests for OCPP 2.0.1 GetLog command handling (K01)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  LogEnumType,
  LogStatusEnumType,
  type OCPP20GetLogRequest,
  type OCPP20GetLogResponse,
  OCPP20IncomingRequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('K01 - GetLog', async () => {
  let station: ChargingStation
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should return Accepted with filename for DiagnosticsLog request', () => {
    const request: OCPP20GetLogRequest = {
      log: {
        remoteLocation: 'ftp://logs.example.com/uploads/',
      },
      logType: LogEnumType.DiagnosticsLog,
      requestId: 1,
    }

    const response = testableService.handleRequestGetLog(station, request)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.strictEqual(response.status, LogStatusEnumType.Accepted)
    assert.strictEqual(response.filename, 'simulator-log.txt')
  })

  await it('should return Accepted with filename for SecurityLog request', () => {
    const request: OCPP20GetLogRequest = {
      log: {
        remoteLocation: 'https://logs.example.com/security/',
      },
      logType: LogEnumType.SecurityLog,
      requestId: 2,
    }

    const response = testableService.handleRequestGetLog(station, request)

    assert.strictEqual(response.status, LogStatusEnumType.Accepted)
    assert.strictEqual(response.filename, 'simulator-log.txt')
  })

  await it('should pass through requestId correctly across different values', () => {
    const testRequestId = 42
    const request: OCPP20GetLogRequest = {
      log: {
        remoteLocation: 'ftp://logs.example.com/uploads/',
      },
      logType: LogEnumType.DiagnosticsLog,
      requestId: testRequestId,
    }

    const response = testableService.handleRequestGetLog(station, request)

    assert.strictEqual(response.status, LogStatusEnumType.Accepted)
    assert.strictEqual(typeof response.status, 'string')
    assert.strictEqual(response.filename, 'simulator-log.txt')
  })

  await it('should return Accepted for request with retries and retryInterval', () => {
    const request: OCPP20GetLogRequest = {
      log: {
        latestTimestamp: new Date('2025-01-15T23:59:59.000Z'),
        oldestTimestamp: new Date('2025-01-01T00:00:00.000Z'),
        remoteLocation: 'ftp://logs.example.com/uploads/',
      },
      logType: LogEnumType.DiagnosticsLog,
      requestId: 5,
      retries: 3,
      retryInterval: 60,
    }

    const response = testableService.handleRequestGetLog(station, request)

    assert.strictEqual(response.status, LogStatusEnumType.Accepted)
    assert.strictEqual(response.filename, 'simulator-log.txt')
  })

  await it('should register GET_LOG event listener in constructor', () => {
    const service = new OCPP20IncomingRequestService()
    assert.strictEqual(service.listenerCount(OCPP20IncomingRequestCommand.GET_LOG), 1)
  })

  await it('should call simulateLogUploadLifecycle when GET_LOG event emitted with Accepted response', () => {
    const service = new OCPP20IncomingRequestService()
    const simulateMock = mock.method(
      service as unknown as {
        simulateLogUploadLifecycle: (
          chargingStation: ChargingStation,
          requestId: number
        ) => Promise<void>
      },
      'simulateLogUploadLifecycle',
      () => Promise.resolve()
    )

    const request: OCPP20GetLogRequest = {
      log: {
        remoteLocation: 'https://csms.example.com/logs',
      },
      logType: LogEnumType.DiagnosticsLog,
      requestId: 10,
    }
    const response: OCPP20GetLogResponse = {
      filename: 'simulator-log.txt',
      status: LogStatusEnumType.Accepted,
    }

    service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

    assert.strictEqual(simulateMock.mock.callCount(), 1)
    assert.strictEqual(simulateMock.mock.calls[0].arguments[1], 10)
  })

  await it('should NOT call simulateLogUploadLifecycle when GET_LOG event emitted with Rejected response', () => {
    const service = new OCPP20IncomingRequestService()
    const simulateMock = mock.method(
      service as unknown as {
        simulateLogUploadLifecycle: (
          chargingStation: ChargingStation,
          requestId: number
        ) => Promise<void>
      },
      'simulateLogUploadLifecycle',
      () => Promise.resolve()
    )

    const request: OCPP20GetLogRequest = {
      log: {
        remoteLocation: 'https://csms.example.com/logs',
      },
      logType: LogEnumType.DiagnosticsLog,
      requestId: 11,
    }
    const response: OCPP20GetLogResponse = {
      status: LogStatusEnumType.Rejected,
    }

    service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

    assert.strictEqual(simulateMock.mock.callCount(), 0)
  })

  await it('should handle simulateLogUploadLifecycle rejection gracefully', async () => {
    const service = new OCPP20IncomingRequestService()
    mock.method(
      service as unknown as {
        simulateLogUploadLifecycle: (
          chargingStation: ChargingStation,
          requestId: number
        ) => Promise<void>
      },
      'simulateLogUploadLifecycle',
      () => Promise.reject(new Error('log upload error'))
    )

    const request: OCPP20GetLogRequest = {
      log: {
        remoteLocation: 'https://csms.example.com/logs',
      },
      logType: LogEnumType.DiagnosticsLog,
      requestId: 99,
    }
    const response: OCPP20GetLogResponse = {
      filename: 'simulator-log.txt',
      status: LogStatusEnumType.Accepted,
    }

    service.emit(OCPP20IncomingRequestCommand.GET_LOG, station, request, response)

    await Promise.resolve()
  })
})
