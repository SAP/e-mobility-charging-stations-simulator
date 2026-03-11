/**
 * @file Tests for OCPP20IncomingRequestService GetTransactionStatus
 * @description Unit tests for OCPP 2.0.1 GetTransactionStatus command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('GetTransactionStatus - Handler', async () => {
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
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  // Per D14: No active transaction, no transactionId → ongoingIndicator: false
  await it('should return ongoingIndicator false when no active transaction and no transactionId', () => {
    const response = testableService.handleRequestGetTransactionStatus(station, {})

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.strictEqual(response.ongoingIndicator, false)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // Per E28-E34: With active transaction on EVSE, no transactionId → ongoingIndicator: true
  await it('should return ongoingIndicator true when active transaction exists and no transactionId', () => {
    const transactionId = 'txn-12345'
    setupConnectorWithTransaction(station, 1, {
      transactionId: transactionId as unknown as number,
    })

    const response = testableService.handleRequestGetTransactionStatus(station, {})

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, true)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // Per D14: With specific transactionId that doesn't exist → ongoingIndicator: false
  await it('should return ongoingIndicator false when specific transactionId does not exist', () => {
    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId: 'nonexistent-txn-id',
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, false)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // Per E28-E34: With specific transactionId that exists → ongoingIndicator: true
  await it('should return ongoingIndicator true when specific transactionId exists', () => {
    const transactionId = 'txn-67890'
    setupConnectorWithTransaction(station, 2, {
      transactionId: transactionId as unknown as number,
    })

    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, true)
    assert.strictEqual(response.messagesInQueue, false)
  })
})
