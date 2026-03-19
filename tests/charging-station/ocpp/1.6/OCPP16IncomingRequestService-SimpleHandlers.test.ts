/**
 * @file Tests for OCPP16IncomingRequestService simple handlers
 * @description Tests for ClearCache (§5.5) and DataTransfer (§5.6) incoming request handlers
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { OCPP16DataTransferStatus } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — SimpleHandlers', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // @spec §5.5: ClearCache
  await describe('handleRequestClearCache', async () => {
    await it('should return response with status field', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestClearCache(station)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.notStrictEqual(response.status, undefined)
      assert.strictEqual(typeof response.status, 'string')
    })
  })

  // @spec §5.6: DataTransfer
  await describe('handleRequestDataTransfer', async () => {
    await it('should return UnknownVendorId status for unknown vendor', () => {
      // Arrange
      const { station, testableService } = context
      const dataTransferRequest = {
        data: 'test-data',
        messageId: 'test-msg',
        vendorId: 'unknown-vendor-xyz',
      }

      // Act
      const response = testableService.handleRequestDataTransfer(station, dataTransferRequest)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, OCPP16DataTransferStatus.UNKNOWN_VENDOR_ID)
      assert.strictEqual(typeof response.status, 'string')
    })

    await it('should return Accepted status for matching vendor without messageId', () => {
      // Arrange
      const { station, testableService } = context
      const matchingVendor = 'test-vendor-match'
      if (station.stationInfo != null) {
        station.stationInfo.chargePointVendor = matchingVendor
      }
      const dataTransferRequest = {
        data: 'test-data',
        vendorId: matchingVendor,
      }

      // Act
      const response = testableService.handleRequestDataTransfer(station, dataTransferRequest)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, OCPP16DataTransferStatus.ACCEPTED)
      assert.strictEqual(typeof response.status, 'string')
    })

    await it('should return UnknownMessageId for matching vendor with messageId', () => {
      // Arrange
      const { station, testableService } = context
      const matchingVendor = 'test-vendor-match'
      if (station.stationInfo != null) {
        station.stationInfo.chargePointVendor = matchingVendor
      }
      const dataTransferRequest = {
        data: 'test-data',
        messageId: 'test-msg',
        vendorId: matchingVendor,
      }

      // Act
      const response = testableService.handleRequestDataTransfer(station, dataTransferRequest)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, OCPP16DataTransferStatus.UNKNOWN_MESSAGE_ID)
      assert.strictEqual(typeof response.status, 'string')
    })
  })
})
