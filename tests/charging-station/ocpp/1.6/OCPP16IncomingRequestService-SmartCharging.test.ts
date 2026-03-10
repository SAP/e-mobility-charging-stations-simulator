/**
 * @file Tests for OCPP16IncomingRequestService Smart Charging handlers
 * @description Unit tests for OCPP 1.6 SetChargingProfile (§9.3), ClearChargingProfile (§9.1),
 *   and GetCompositeSchedule (§9.2) incoming request handlers
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  OCPP16ClearChargingProfileRequest,
  OCPP16GetCompositeScheduleRequest,
  SetChargingProfileRequest,
} from '../../../../src/types/index.js'

import { GenericStatus, OCPP16StandardParametersKey } from '../../../../src/types/index.js'
import {
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
} from '../../../../src/types/ocpp/1.6/ChargingProfile.js'
import {
  OCPP16ChargingProfileStatus,
  OCPP16ClearChargingProfileStatus,
} from '../../../../src/types/ocpp/1.6/Responses.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  ChargingProfileFixtures,
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — SmartCharging', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // ============================================================================
  // SetChargingProfile (§9.3)
  // ============================================================================

  await describe('handleRequestSetChargingProfile', async () => {
    // @spec §9.3 — TC_053_CS
    it('should accept a valid TxDefaultProfile on a valid connector', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createTxDefaultProfile()
      const request: SetChargingProfileRequest = {
        connectorId: 1,
        csChargingProfiles: profile,
      }

      // Act
      const response = testableService.handleRequestSetChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ChargingProfileStatus.ACCEPTED)
    })

    it('should accept a ChargePointMaxProfile on connector 0', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createChargePointMaxProfile()
      const request: SetChargingProfileRequest = {
        connectorId: 0,
        csChargingProfiles: profile,
      }

      // Act
      const response = testableService.handleRequestSetChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ChargingProfileStatus.ACCEPTED)
    })

    // @spec §9.3 — TC_058_CS
    it('should reject a profile for a non-existing connector', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createTxDefaultProfile()
      const request: SetChargingProfileRequest = {
        connectorId: 99,
        csChargingProfiles: profile,
      }

      // Act
      const response = testableService.handleRequestSetChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ChargingProfileStatus.REJECTED)
    })

    it('should reject a ChargePointMaxProfile on a non-zero connector', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createChargePointMaxProfile()
      const request: SetChargingProfileRequest = {
        connectorId: 1,
        csChargingProfiles: profile,
      }

      // Act
      const response = testableService.handleRequestSetChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ChargingProfileStatus.REJECTED)
    })

    it('should return NotSupported when SmartCharging feature profile is not enabled', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core'
      )
      const profile = ChargingProfileFixtures.createTxDefaultProfile()
      const request: SetChargingProfileRequest = {
        connectorId: 1,
        csChargingProfiles: profile,
      }

      // Act
      const response = testableService.handleRequestSetChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ChargingProfileStatus.NOT_SUPPORTED)
    })
  })

  // ============================================================================
  // ClearChargingProfile (§9.1)
  // ============================================================================

  await describe('handleRequestClearChargingProfile', async () => {
    // @spec §9.1 — TC_055_CS
    it('should accept clearing profiles by profile ID', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createTxDefaultProfile(10)
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.chargingProfiles = [profile]
      }
      const request: OCPP16ClearChargingProfileRequest = {
        id: 10,
      }

      // Act
      const response = testableService.handleRequestClearChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ClearChargingProfileStatus.ACCEPTED)
    })

    // @spec §9.1 — TC_056_CS
    it('should accept clearing profiles by purpose and stack level', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createTxDefaultProfile(1, 0)
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.chargingProfiles = [profile]
      }
      const request: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE,
        stackLevel: 0,
      }

      // Act
      const response = testableService.handleRequestClearChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ClearChargingProfileStatus.ACCEPTED)
    })

    it('should return Unknown when no matching profiles exist', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      // Ensure no profiles on any connector
      for (const [connectorId] of station.connectors.entries()) {
        const connectorStatus = station.getConnectorStatus(connectorId)
        if (connectorStatus != null) {
          connectorStatus.chargingProfiles = []
        }
      }
      const request: OCPP16ClearChargingProfileRequest = {
        id: 999,
      }

      // Act
      const response = testableService.handleRequestClearChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ClearChargingProfileStatus.UNKNOWN)
    })

    it('should return Unknown when SmartCharging feature profile is not enabled', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core'
      )
      const request: OCPP16ClearChargingProfileRequest = {
        id: 1,
      }

      // Act
      const response = testableService.handleRequestClearChargingProfile(station, request)

      // Assert
      expect(response.status).toBe(OCPP16ClearChargingProfileStatus.UNKNOWN)
    })
  })

  // ============================================================================
  // GetCompositeSchedule (§9.2)
  // ============================================================================

  await describe('handleRequestGetCompositeSchedule', async () => {
    // @spec §9.2 — TC_054_CS
    it('should return Accepted with schedule when profiles exist on connector', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const profile = ChargingProfileFixtures.createTxDefaultProfile()
      profile.chargingSchedule.startSchedule = new Date()
      profile.chargingSchedule.duration = 3600
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.chargingProfiles = [profile]
      }
      const request: OCPP16GetCompositeScheduleRequest = {
        connectorId: 1,
        duration: 3600,
      }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert
      expect(response.status).toBe(GenericStatus.Accepted)
      expect(response.connectorId).toBe(1)
      expect(response.chargingSchedule).toBeDefined()
      expect(response.scheduleStart).toBeDefined()
    })

    it('should return Rejected for a non-existing connector', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const request: OCPP16GetCompositeScheduleRequest = {
        connectorId: 99,
        duration: 3600,
      }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert
      expect(response.status).toBe(GenericStatus.Rejected)
    })

    it('should return Rejected for connector 0', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      const request: OCPP16GetCompositeScheduleRequest = {
        connectorId: 0,
        duration: 3600,
      }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert
      expect(response.status).toBe(GenericStatus.Rejected)
    })

    it('should return Rejected when no profiles are set on connector', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      // Ensure no profiles on connector 1 or connector 0
      const connector1Status = station.getConnectorStatus(1)
      if (connector1Status != null) {
        connector1Status.chargingProfiles = []
      }
      const connector0Status = station.getConnectorStatus(0)
      if (connector0Status != null) {
        connector0Status.chargingProfiles = []
      }
      const request: OCPP16GetCompositeScheduleRequest = {
        connectorId: 1,
        duration: 3600,
      }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert
      expect(response.status).toBe(GenericStatus.Rejected)
    })

    it('should return Rejected when SmartCharging feature profile is not enabled', () => {
      // Arrange
      const { testableService, station } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core'
      )
      const request: OCPP16GetCompositeScheduleRequest = {
        connectorId: 1,
        duration: 3600,
      }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert
      expect(response.status).toBe(GenericStatus.Rejected)
    })
  })
})
