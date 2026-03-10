/**
 * @file Tests for OCPP16IncomingRequestService RemoteStartTransaction
 * @description Unit tests for OCPP 1.6 RemoteStartTransaction incoming request handler (§5.11)
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { RemoteStartTransactionRequest } from '../../../../src/types/index.js'

import { AvailabilityType, GenericStatus } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — RemoteStartTransaction', async () => {
  let testContext: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    testContext = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // @spec §5.11 — TC_021_CS: connectorId=0 must be rejected
  await it('should reject remote start transaction with connectorId=0', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      connectorId: 0,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Rejected)
  })

  // @spec §5.11 — TC_013_CS: Valid connectorId with available connector
  await it('should accept remote start transaction with valid connectorId and available connector', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      connectorId: 1,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Accepted)
  })

  // @spec §5.11 — TC_014_CS: All connectors have active transactions, no connectorId specified
  await it('should reject remote start transaction when all connectors have active transactions', async () => {
    // Arrange
    const { station, testableService } = testContext

    // Set all connectors as having active transactions
    for (let connectorId = 1; connectorId <= station.getNumberOfConnectors(); connectorId++) {
      const connectorStatus = station.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.transactionStarted = true
        connectorStatus.transactionId = connectorId * 100
      }
    }

    const request: RemoteStartTransactionRequest = {
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Rejected)
  })

  // @spec §5.11 — TC_015_CS: No connectorId specified, finds first available connector
  await it('should accept remote start transaction without connectorId when connector is available', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Accepted)
  })

  // @spec §5.11 — Connector in Unavailable (Inoperative) status
  await it('should reject remote start transaction when connector is unavailable', async () => {
    // Arrange
    const { station, testableService } = testContext

    // Set connector 1 availability to Inoperative (Unavailable)
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.availability = AvailabilityType.Inoperative
    }

    const request: RemoteStartTransactionRequest = {
      connectorId: 1,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Rejected)
  })

  // @spec §5.11 — Station-level unavailability
  await it('should reject remote start transaction when charging station is unavailable', async () => {
    // Arrange
    const { station, testableService } = testContext

    // Set station-level (connector 0) availability to Inoperative
    const connector0Status = station.getConnectorStatus(0)
    if (connector0Status != null) {
      connector0Status.availability = AvailabilityType.Inoperative
    }

    const request: RemoteStartTransactionRequest = {
      connectorId: 1,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Rejected)
  })

  // @spec §5.11 — Non-existing connector
  await it('should reject remote start transaction with non-existing connectorId', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      connectorId: 99,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    expect(response.status).toBe(GenericStatus.Rejected)
  })
})
