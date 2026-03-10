/**
 * @file Tests for OCPP16IncomingRequestService Reset
 * @description Unit tests for OCPP 1.6 Reset incoming request handler (§5.13)
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ResetRequest } from '../../../../src/types/index.js'

import { GenericStatus } from '../../../../src/types/index.js'
import { ResetType } from '../../../../src/types/ocpp/1.6/Requests.js'
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
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response.status).toBeDefined()
    expect(response.status).toBe(GenericStatus.Accepted)
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
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response.status).toBeDefined()
    expect(response.status).toBe(GenericStatus.Accepted)
  })

  // @spec §5.13 — TC_024_CS: Hard reset with active transaction
  await it('should handle hard reset request with active transaction', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(1)
    const connector = station.getConnectorStatus(1)
    if (connector != null) {
      connector.transactionStarted = true
      connector.transactionId = 1
    }

    const resetRequest: ResetRequest = {
      type: ResetType.HARD,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response.status).toBeDefined()
    expect(response.status).toBe(GenericStatus.Accepted)
  })

  // @spec §5.13 — TC_025_CS: Soft reset with active transaction
  await it('should handle soft reset request with active transaction', () => {
    // Arrange
    const { testableService } = testContext
    const station = ResetFixtures.createStandardStation(1)
    const connector = station.getConnectorStatus(1)
    if (connector != null) {
      connector.transactionStarted = true
      connector.transactionId = 1
    }

    const resetRequest: ResetRequest = {
      type: ResetType.SOFT,
    }

    // Act
    const response = testableService.handleRequestReset(station, resetRequest)

    // Assert
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response.status).toBeDefined()
    expect(response.status).toBe(GenericStatus.Accepted)
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
    expect(response).toBeDefined()
    expect(response.status).toBeDefined()
    expect(typeof response.status).toBe('string')
    expect([GenericStatus.Accepted, GenericStatus.Rejected]).toContain(response.status)
  })
})
