/**
 * @file Tests for OCPP16IncomingRequestService TriggerMessage handler
 * @description Tests for TriggerMessage (§10.1) incoming request handler covering
 *   accepted triggers, unimplemented triggers, and feature profile validation
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  OCPP16MessageTrigger,
  OCPP16StandardParametersKey,
  OCPP16TriggerMessageStatus,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — TriggerMessage', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
    upsertConfigurationKey(
      context.station,
      OCPP16StandardParametersKey.SupportedFeatureProfiles,
      'Core,RemoteTrigger'
    )
  })

  afterEach(() => {
    standardCleanup()
  })

  // @spec §10.1 — TC_061_CS
  await describe('BootNotification trigger', async () => {
    await it('should return Accepted for BootNotification trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  // @spec §10.1 — TC_062_CS
  await describe('Heartbeat trigger', async () => {
    await it('should return Accepted for Heartbeat trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.Heartbeat,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('StatusNotification trigger', async () => {
    await it('should return Accepted for StatusNotification trigger with connectorId', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        connectorId: 1,
        requestedMessage: OCPP16MessageTrigger.StatusNotification,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('MeterValues trigger', async () => {
    await it('should return NotImplemented for MeterValues trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        connectorId: 1,
        requestedMessage: OCPP16MessageTrigger.MeterValues,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })

  await describe('DiagnosticsStatusNotification trigger', async () => {
    await it('should return NotImplemented for DiagnosticsStatusNotification trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.DiagnosticsStatusNotification,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })

  await describe('FirmwareStatusNotification trigger', async () => {
    await it('should return NotImplemented for FirmwareStatusNotification trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.FirmwareStatusNotification,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })

  await describe('unsupported requestedMessage', async () => {
    await it('should return NotImplemented for unknown requestedMessage value', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: 'UnknownMessage' as OCPP16MessageTrigger,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })

  await describe('feature profile not enabled', async () => {
    await it('should return NotImplemented when RemoteTrigger profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core'
      )

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
      })

      // Assert
      expect(response.status).toBe(OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })
})
