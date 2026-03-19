/**
 * @file Tests for OCPP16IncomingRequestService — ChangeAvailability handler
 * @description Verifies the ChangeAvailability incoming request handler (§5.3) for
 * OCPP 1.6 covering whole-station (connectorId=0) and single-connector scenarios,
 * active transaction scheduling, and invalid connector rejection.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { TestableOCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/__testable__/index.js'

import {
  OCPP16AvailabilityStatus,
  OCPP16AvailabilityType,
  type OCPP16ChangeAvailabilityRequest,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createOCPP16IncomingRequestTestContext, setMockRequestHandler } from './OCPP16TestUtils.js'

// @spec §5.3 — ChangeAvailability

await describe('OCPP16IncomingRequestService — ChangeAvailability', async () => {
  let station: ChargingStation
  let testableService: TestableOCPP16IncomingRequestService

  beforeEach(() => {
    const ctx = createOCPP16IncomingRequestTestContext()
    station = ctx.station
    testableService = ctx.testableService

    // Mock requestHandler so sendAndSetConnectorStatus resolves without error
    setMockRequestHandler(station, async () => Promise.resolve({}))
  })

  afterEach(() => {
    standardCleanup()
  })

  // ─── connectorId=0 (all connectors) ──────────────────────────────────

  await describe('connectorId=0 (all connectors)', async () => {
    await it('should return Accepted when setting all connectors to Operative', async () => {
      // Arrange
      const request: OCPP16ChangeAvailabilityRequest = {
        connectorId: 0,
        type: OCPP16AvailabilityType.Operative,
      }

      // Act
      const response = await testableService.handleRequestChangeAvailability(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16AvailabilityStatus.ACCEPTED)
    })

    await it('should return Accepted when setting all connectors to Inoperative', async () => {
      // Arrange
      const request: OCPP16ChangeAvailabilityRequest = {
        connectorId: 0,
        type: OCPP16AvailabilityType.Inoperative,
      }

      // Act
      const response = await testableService.handleRequestChangeAvailability(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16AvailabilityStatus.ACCEPTED)
    })
  })

  // ─── connectorId=1 (specific connector) ──────────────────────────────

  await describe('connectorId=1 (specific connector)', async () => {
    await it('should return Accepted when setting connector to Operative', async () => {
      // Arrange
      const request: OCPP16ChangeAvailabilityRequest = {
        connectorId: 1,
        type: OCPP16AvailabilityType.Operative,
      }

      // Act
      const response = await testableService.handleRequestChangeAvailability(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16AvailabilityStatus.ACCEPTED)
    })

    await it('should return Accepted when setting connector to Inoperative', async () => {
      // Arrange
      const request: OCPP16ChangeAvailabilityRequest = {
        connectorId: 1,
        type: OCPP16AvailabilityType.Inoperative,
      }

      // Act
      const response = await testableService.handleRequestChangeAvailability(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16AvailabilityStatus.ACCEPTED)
    })
  })

  // ─── Active transaction → Scheduled ──────────────────────────────────

  await it('should return Scheduled when connector has an active transaction', async () => {
    // Arrange — simulate active transaction on connector 1
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.transactionStarted = true
    }
    const request: OCPP16ChangeAvailabilityRequest = {
      connectorId: 1,
      type: OCPP16AvailabilityType.Inoperative,
    }

    // Act
    const response = await testableService.handleRequestChangeAvailability(station, request)

    // Assert
    assert.strictEqual(response.status, OCPP16AvailabilityStatus.SCHEDULED)
  })

  // ─── Invalid connectorId → Rejected ──────────────────────────────────

  await it('should return Rejected for a non-existing connector id', async () => {
    // Arrange
    const request: OCPP16ChangeAvailabilityRequest = {
      connectorId: 99,
      type: OCPP16AvailabilityType.Operative,
    }

    // Act
    const response = await testableService.handleRequestChangeAvailability(station, request)

    // Assert
    assert.strictEqual(response.status, OCPP16AvailabilityStatus.REJECTED)
  })
})
