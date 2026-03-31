/**
 * @file Tests for OCPPServiceFactory
 * @description Verifies that createOCPPServices returns correct service instances for each OCPP
 *   version and throws OCPPError for unsupported versions.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { OCPP16IncomingRequestService } from '../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import { OCPP16RequestService } from '../../../src/charging-station/ocpp/1.6/OCPP16RequestService.js'
import { OCPP20IncomingRequestService } from '../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20RequestService } from '../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { createOCPPServices } from '../../../src/charging-station/ocpp/OCPPServiceFactory.js'
import { OCPPError } from '../../../src/exception/index.js'
import { OCPPVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

await describe('OCPPServiceFactory', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should return OCPP 1.6 services for VERSION_16', () => {
    const { incomingRequestService, requestService } = createOCPPServices(OCPPVersion.VERSION_16)

    assert.ok(incomingRequestService instanceof OCPP16IncomingRequestService)
    assert.ok(requestService instanceof OCPP16RequestService)
  })

  await it('should return OCPP 2.0 services for VERSION_20', () => {
    const { incomingRequestService, requestService } = createOCPPServices(OCPPVersion.VERSION_20)

    assert.ok(incomingRequestService instanceof OCPP20IncomingRequestService)
    assert.ok(requestService instanceof OCPP20RequestService)
  })

  await it('should return OCPP 2.0 services for VERSION_201', () => {
    const { incomingRequestService, requestService } = createOCPPServices(OCPPVersion.VERSION_201)

    assert.ok(incomingRequestService instanceof OCPP20IncomingRequestService)
    assert.ok(requestService instanceof OCPP20RequestService)
  })

  await it('should throw OCPPError for unsupported version', () => {
    assert.throws(
      () => {
        createOCPPServices('3.0' as unknown as OCPPVersion)
      },
      (error: unknown) => {
        assert.ok(error instanceof OCPPError)
        assert.ok(error.message.includes('Unsupported OCPP version'))
        return true
      }
    )
  })
})
