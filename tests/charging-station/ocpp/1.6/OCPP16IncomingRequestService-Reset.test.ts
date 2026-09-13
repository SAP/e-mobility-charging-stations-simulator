/**
 * @file Tests for OCPP16IncomingRequestService Reset
 * @description Unit tests for OCPP 1.6 Reset incoming request handler (§5.13)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ResetRequest } from '../../../../src/types/index.js'

import {
  GenericStatus,
  OCPP16IncomingRequestCommand,
  ResetType,
} from '../../../../src/types/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  ResetFixtures,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — Reset', async () => {
  let testContext: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    testContext = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // @spec §5.13 — TC_022_CS: Hard reset without active transactions
  await it('should handle hard reset request without active transactions', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(0)
    const resetRequest: ResetRequest = {
      type: ResetType.HARD,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, GenericStatus.Accepted)
  })

  // @spec §5.13 — TC_023_CS: Soft reset without active transactions
  await it('should handle soft reset request without active transactions', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(0)
    const resetRequest: ResetRequest = {
      type: ResetType.SOFT,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, GenericStatus.Accepted)
  })

  // @spec §5.13 — TC_024_CS: Hard reset with active transaction
  await it('should handle hard reset request with active transaction', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(1)
    setupConnectorWithTransaction(station, 1, { transactionId: 1 })

    const resetRequest: ResetRequest = {
      type: ResetType.HARD,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, GenericStatus.Accepted)
  })

  // @spec §5.13 — TC_025_CS: Soft reset with active transaction
  await it('should handle soft reset request with active transaction', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(1)
    setupConnectorWithTransaction(station, 1, { transactionId: 1 })

    const resetRequest: ResetRequest = {
      type: ResetType.SOFT,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, GenericStatus.Accepted)
  })

  await it('should send the Reset response before starting the station reset', async () => {
    const { incomingRequestService, station } = testContext
    station.started = true
    station.inAcceptedState = () => true
    station.recordRequestStatistic = () => undefined
    const callOrder: string[] = []
    const reset = mock.fn((): Promise<void> => {
      callOrder.push('reset')
      return Promise.resolve()
    })
    Object.assign(station, { reset })
    const sendResponse = mock.fn((...args: unknown[]): Promise<void> => {
      callOrder.push('response')
      const requestParams = args[4] as undefined | { onMessageSent?: () => void }
      requestParams?.onMessageSent?.()
      return Promise.resolve()
    })
    Object.assign(station.ocppRequestService, { sendResponse })

    await incomingRequestService.incomingRequestHandler(
      station,
      'reset-response-before-stop',
      OCPP16IncomingRequestCommand.RESET,
      { type: ResetType.HARD }
    )

    assert.strictEqual(sendResponse.mock.callCount(), 1)
    assert.strictEqual(reset.mock.callCount(), 1)
    assert.deepStrictEqual(callOrder, ['response', 'reset'])
  })

  await it('should discard a Reset action when its response settles in a newer lifecycle', async () => {
    const { incomingRequestService, station } = testContext
    const responseStarted = Promise.withResolvers<undefined>()
    const releaseResponse = Promise.withResolvers<undefined>()
    const stationLifecycle = station as unknown as { lifecycleAbortController: AbortController }
    stationLifecycle.lifecycleAbortController = new AbortController()
    Object.defineProperty(station, 'lifecycleAbortSignal', {
      configurable: true,
      get: () => stationLifecycle.lifecycleAbortController.signal,
    })
    station.started = true
    station.inAcceptedState = () => true
    station.recordRequestStatistic = () => undefined
    const reset = mock.fn((): Promise<void> => Promise.resolve())
    Object.assign(station, { reset })
    const sendResponse = mock.fn((): Promise<void> => {
      responseStarted.resolve(undefined)
      return releaseResponse.promise
    })
    Object.assign(station.ocppRequestService, { sendResponse })

    const handling = incomingRequestService.incomingRequestHandler(
      station,
      'stale-reset-response',
      OCPP16IncomingRequestCommand.RESET,
      { type: ResetType.HARD }
    )
    await responseStarted.promise
    stationLifecycle.lifecycleAbortController.abort()
    stationLifecycle.lifecycleAbortController = new AbortController()
    releaseResponse.resolve(undefined)
    await handling

    assert.strictEqual(reset.mock.callCount(), 0)
  })

  // Additional test: Verify response structure
  await it('should return proper response structure for reset', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(0)
    const resetRequest: ResetRequest = {
      type: ResetType.HARD,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(typeof response.status, 'string')
    assert.ok([GenericStatus.Accepted, GenericStatus.Rejected].includes(response.status))
  })
})
