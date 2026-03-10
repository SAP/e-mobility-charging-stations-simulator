/**
 * @file Tests for OCPP16IncomingRequestService simple handlers
 * @description Tests for ClearCache (§5.5) and DataTransfer (§5.6) incoming request handlers
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { OCPP16DataTransferStatus } from '../../../../src/types/ocpp/1.6/Responses.js'
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
      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
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
      expect(response).toBeDefined()
      expect(response.status).toBe(OCPP16DataTransferStatus.UNKNOWN_VENDOR_ID)
      expect(typeof response.status).toBe('string')
    })

    await it('should return Accepted status for matching vendor', () => {
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
      expect(response).toBeDefined()
      expect(response.status).toBe('Accepted')
      expect(typeof response.status).toBe('string')
    })
  })
})
