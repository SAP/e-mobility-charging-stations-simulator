/**
 * @file Tests for OCPP16IncomingRequestService Smart Charging handlers
 * @description Unit tests for OCPP 1.6 SetChargingProfile (§9.3), ClearChargingProfile (§9.1),
 *   and GetCompositeSchedule (§9.2) incoming request handlers
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP16ChargingProfile,
  OCPP16ClearChargingProfileRequest,
  OCPP16GetCompositeScheduleRequest,
  SetChargingProfileRequest,
} from '../../../../src/types/index.js'

import {
  GenericStatus,
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingProfileStatus,
  OCPP16ClearChargingProfileStatus,
  OCPP16StandardParametersKey,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  ChargingProfileFixtures,
  createOCPP16IncomingRequestTestContext,
  createOCPP16NonContiguousConnectorsContext,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

const attachComposableProfile = (
  station: ChargingStation,
  connectorId: number,
  profile: OCPP16ChargingProfile
): void => {
  profile.chargingSchedule.startSchedule = new Date()
  profile.chargingSchedule.duration = 3600
  const connectorStatus = station.getConnectorStatus(connectorId)
  if (connectorStatus != null) {
    connectorStatus.chargingProfiles = [profile]
  }
}

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
    await it('should accept a valid TxDefaultProfile on a valid connector', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, OCPP16ChargingProfileStatus.ACCEPTED)
    })

    await it('should accept a ChargePointMaxProfile on connector 0', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, OCPP16ChargingProfileStatus.ACCEPTED)
    })

    // @spec §9.3 — TC_058_CS
    await it('should reject a profile for a non-existing connector', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, OCPP16ChargingProfileStatus.REJECTED)
    })

    await it('should reject a ChargePointMaxProfile on a non-zero connector', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, OCPP16ChargingProfileStatus.REJECTED)
    })

    await it('should return NotSupported when SmartCharging feature profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')
      const profile = ChargingProfileFixtures.createTxDefaultProfile()
      const request: SetChargingProfileRequest = {
        connectorId: 1,
        csChargingProfiles: profile,
      }

      // Act
      const response = testableService.handleRequestSetChargingProfile(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ChargingProfileStatus.NOT_SUPPORTED)
    })
  })

  // ============================================================================
  // ClearChargingProfile (§9.1)
  // ============================================================================

  await describe('handleRequestClearChargingProfile', async () => {
    // @spec §9.1 — TC_055_CS
    await it('should accept clearing profiles by profile ID', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, OCPP16ClearChargingProfileStatus.ACCEPTED)
    })

    // @spec §9.1 — TC_056_CS
    await it('should accept clearing profiles by purpose and stack level', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, OCPP16ClearChargingProfileStatus.ACCEPTED)
    })

    await it('should return Unknown when no matching profiles exist', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      // Ensure no profiles on any connector
      for (const { connectorId } of station.iterateConnectors()) {
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
      assert.strictEqual(response.status, OCPP16ClearChargingProfileStatus.UNKNOWN)
    })

    await it('should return Unknown when SmartCharging feature profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')
      const request: OCPP16ClearChargingProfileRequest = {
        id: 1,
      }

      // Act
      const response = testableService.handleRequestClearChargingProfile(station, request)

      // Assert
      assert.strictEqual(response.status, OCPP16ClearChargingProfileStatus.UNKNOWN)
    })
  })

  // ============================================================================
  // GetCompositeSchedule (§9.2)
  // ============================================================================

  await describe('handleRequestGetCompositeSchedule', async () => {
    // @spec §9.2 — TC_054_CS
    await it('should return Accepted with schedule when profiles exist on connector', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, GenericStatus.Accepted)
      assert.strictEqual(response.connectorId, 1)
      assert.notStrictEqual(response.chargingSchedule, undefined)
      assert.notStrictEqual(response.scheduleStart, undefined)
    })

    await it('should return Rejected for a non-existing connector', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    await it('should return Rejected for connector 0', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    await it('should return Rejected when no profiles are set on connector', () => {
      // Arrange
      const { station, testableService } = context
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
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    await it('should return Rejected when SmartCharging feature profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')
      const request: OCPP16GetCompositeScheduleRequest = {
        connectorId: 1,
        duration: 3600,
      }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)
    })

    // @spec §9.2 — connector-0 aggregation scans every connector (skipZero=false).
    // On a non-contiguous layout {1, 3}, getNumberOfConnectors() returns 2 (a COUNT)
    // while connector 3 lives beyond it, so a numeric 1..count loop would miss its
    // profile and reject the connector-0 composite schedule.
    await it('should include a profile from a connector whose id exceeds the connector count in the connector-0 composite schedule', () => {
      // Arrange
      const { station, testableService } = createOCPP16NonContiguousConnectorsContext()
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      attachComposableProfile(station, 3, ChargingProfileFixtures.createTxDefaultProfile())
      const request: OCPP16GetCompositeScheduleRequest = { connectorId: 0, duration: 3600 }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert — connector 3's profile is aggregated (old loop missed it → Rejected)
      assert.strictEqual(response.status, GenericStatus.Accepted)
      assert.strictEqual(response.connectorId, 0)
    })

    // @spec §9.2 — connector-0 aggregation must iterate connector 0 itself
    // (skipZero=false). A ChargePointMaxProfile on connector 0 is not re-concatenated
    // for other connectors by getConnectorChargingProfiles (that concat pulls only
    // connector-0 TX_DEFAULT profiles), so switching this site to skipZero=true would
    // drop it and this test would fail.
    await it('should include a station-wide (connector-0) ChargePointMaxProfile in the connector-0 composite schedule', () => {
      // Arrange
      const { station, testableService } = createOCPP16IncomingRequestTestContext({
        connectorsCount: 2,
      })
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,SmartCharging'
      )
      for (const connectorId of [1, 2]) {
        const connectorStatus = station.getConnectorStatus(connectorId)
        if (connectorStatus != null) {
          connectorStatus.chargingProfiles = []
        }
      }
      attachComposableProfile(station, 0, ChargingProfileFixtures.createChargePointMaxProfile())
      const request: OCPP16GetCompositeScheduleRequest = { connectorId: 0, duration: 3600 }

      // Act
      const response = testableService.handleRequestGetCompositeSchedule(station, request)

      // Assert — connector-0 profile is included (would be dropped under skipZero=true)
      assert.strictEqual(response.status, GenericStatus.Accepted)
      assert.strictEqual(response.connectorId, 0)
    })
  })
})
