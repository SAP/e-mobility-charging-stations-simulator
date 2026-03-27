/**
 * @file Tests for OCPP16IncomingRequestService Reset
 * @description Unit tests for OCPP 1.6 Reset incoming request handler (§5.13)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ResetRequest } from '../../../../src/types/index.js'

import { GenericStatus, ResetType } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
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
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = 1
    }

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
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = 1
    }

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
