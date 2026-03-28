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

await describe('D14 - GetTransactionStatus', async () => {
  let station: ChargingStation
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
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  // E14.FR.06: When no transactionId provided, ongoingIndicator SHALL NOT be set
  await it('should not include ongoingIndicator when no transactionId provided (E14.FR.06)', () => {
    const response = testableService.handleRequestGetTransactionStatus(station, {})

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.strictEqual(response.ongoingIndicator, undefined)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // E14.FR.06: Even with active transactions, no transactionId → ongoingIndicator not set
  await it('should not include ongoingIndicator when active transaction exists but no transactionId (E14.FR.06)', () => {
    const transactionId = 'txn-12345'
    setupConnectorWithTransaction(station, 1, {
      transactionId: transactionId as unknown as number,
    })

    const response = testableService.handleRequestGetTransactionStatus(station, {})

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, undefined)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // E14.FR.01: Unknown transactionId → ongoingIndicator: false
  await it('should return ongoingIndicator false when specific transactionId does not exist', () => {
    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId: 'nonexistent-txn-id',
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, false)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // E14.FR.02: Active transaction with transactionId → ongoingIndicator: true
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
