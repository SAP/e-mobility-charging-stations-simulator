/**
 * @file Tests for OCPP 1.6 Charging Profile Management — Integration
 * @see OCPP 1.6 — §9.3 SetChargingProfile, §9.1 ClearChargingProfile, §9.2 GetCompositeSchedule
 * @description Multi-step integration tests verifying roundtrip flows across SetChargingProfile,
 *   ClearChargingProfile, and GetCompositeSchedule handlers for OCPP 1.6 Smart Charging
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  OCPP16ClearChargingProfileRequest,
  OCPP16GetCompositeScheduleRequest,
  SetChargingProfileRequest,
} from '../../../../src/types/index.js'
import type { OCPP16ChargingProfile } from '../../../../src/types/ocpp/1.6/ChargingProfile.js'

import { GenericStatus, OCPP16StandardParametersKey } from '../../../../src/types/index.js'
import {
  OCPP16ChargingProfileKindType,
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

await describe('OCPP16 Integration — Charging Profile Management', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
    upsertConfigurationKey(
      context.station,
      OCPP16StandardParametersKey.SupportedFeatureProfiles,
      'Core,SmartCharging'
    )
  })

  afterEach(() => {
    standardCleanup()
  })

  // ============================================================================
  // Set → Get Roundtrip
  // ============================================================================

  await it('should return composite schedule matching a set TxDefaultProfile', () => {
    // Arrange
    const { station, testableService } = context
    const profile = ChargingProfileFixtures.createTxDefaultProfile(1, 0)
    profile.chargingSchedule.startSchedule = new Date()
    profile.chargingSchedule.duration = 3600

    const setRequest: SetChargingProfileRequest = {
      connectorId: 1,
      csChargingProfiles: profile,
    }

    // Act — Step 1: Set the charging profile
    const setResponse = testableService.handleRequestSetChargingProfile(station, setRequest)

    // Assert — Step 1: Profile accepted
    assert.strictEqual(setResponse.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Act — Step 2: Get composite schedule
    const getRequest: OCPP16GetCompositeScheduleRequest = {
      connectorId: 1,
      duration: 3600,
    }
    const getResponse = testableService.handleRequestGetCompositeSchedule(station, getRequest)

    // Assert — Step 2: Schedule returned from the set profile
    assert.strictEqual(getResponse.status, GenericStatus.Accepted)
    assert.strictEqual(getResponse.connectorId, 1)
    assert.notStrictEqual(getResponse.chargingSchedule, undefined)
    if (getResponse.chargingSchedule == null) { assert.fail('Expected chargingSchedule to be defined') }
    assert.strictEqual(getResponse.chargingSchedule.chargingRateUnit, OCPP16ChargingRateUnitType.AMPERE)
    assert.notStrictEqual(getResponse.chargingSchedule.chargingSchedulePeriod, undefined)
    assert.notStrictEqual(getResponse.scheduleStart, undefined)
  })

  // ============================================================================
  // Set → Clear → Get Roundtrip
  // ============================================================================

  await it('should return Rejected from GetCompositeSchedule after clearing a set profile', () => {
    // Arrange
    const { station, testableService } = context
    const profile = ChargingProfileFixtures.createTxDefaultProfile(10, 0)
    profile.chargingSchedule.startSchedule = new Date()
    profile.chargingSchedule.duration = 3600

    // Ensure connector 0 has no profiles so only connector 1 matters
    const connector0 = station.getConnectorStatus(0)
    if (connector0 != null) {
      connector0.chargingProfiles = []
    }

    // Act — Step 1: Set the profile on connector 1
    const setResponse = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: profile,
    })
    assert.strictEqual(setResponse.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Act — Step 2: Clear by connector ID
    const clearRequest: OCPP16ClearChargingProfileRequest = {
      connectorId: 1,
    }
    const clearResponse = testableService.handleRequestClearChargingProfile(station, clearRequest)

    // Assert — Step 2: Clear accepted
    assert.strictEqual(clearResponse.status, OCPP16ClearChargingProfileStatus.ACCEPTED)

    // Act — Step 3: Get composite schedule should now be Rejected (no profiles)
    const getRequest: OCPP16GetCompositeScheduleRequest = {
      connectorId: 1,
      duration: 3600,
    }
    const getResponse = testableService.handleRequestGetCompositeSchedule(station, getRequest)

    // Assert — Step 3: Rejected since all profiles were cleared
    assert.strictEqual(getResponse.status, GenericStatus.Rejected)
  })

  // ============================================================================
  // Multiple Profiles with Different Stack Levels → GetCompositeSchedule
  // ============================================================================

  await it('should return Accepted composite schedule with multiple profiles at different stack levels', () => {
    // Arrange
    const { station, testableService } = context
    const profileLow = ChargingProfileFixtures.createTxDefaultProfile(1, 0)
    profileLow.chargingSchedule.startSchedule = new Date()
    profileLow.chargingSchedule.duration = 3600

    const profileHigh = ChargingProfileFixtures.createTxDefaultProfile(2, 1)
    profileHigh.chargingSchedule.startSchedule = new Date()
    profileHigh.chargingSchedule.duration = 3600
    profileHigh.chargingSchedule.chargingSchedulePeriod = [{ limit: 20, startPeriod: 0 }]

    // Act — Set both profiles
    const setLow = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: profileLow,
    })
    const setHigh = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: profileHigh,
    })

    // Assert — Both accepted
    assert.strictEqual(setLow.status, OCPP16ChargingProfileStatus.ACCEPTED)
    assert.strictEqual(setHigh.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Verify both profiles are stored
    const connectorStatus = station.getConnectorStatus(1)
    assert.strictEqual(connectorStatus?.chargingProfiles?.length, 2)

    // Act — Get composite schedule
    const getResponse = testableService.handleRequestGetCompositeSchedule(station, {
      connectorId: 1,
      duration: 3600,
    })

    // Assert — Accepted with valid schedule
    assert.strictEqual(getResponse.status, GenericStatus.Accepted)
    assert.strictEqual(getResponse.connectorId, 1)
    assert.notStrictEqual(getResponse.chargingSchedule, undefined)
  })

  // ============================================================================
  // Replace Profile (Same stackLevel + Purpose)
  // ============================================================================

  await it('should replace a profile with same stackLevel and purpose, keeping only one profile', () => {
    // Arrange
    const { station, testableService } = context
    const originalProfile = ChargingProfileFixtures.createTxDefaultProfile(1, 0)
    originalProfile.chargingSchedule.startSchedule = new Date()
    originalProfile.chargingSchedule.duration = 3600
    originalProfile.chargingSchedule.chargingSchedulePeriod = [{ limit: 32, startPeriod: 0 }]

    const replacementProfile: SetChargingProfileRequest['csChargingProfiles'] = {
      chargingProfileId: 5,
      chargingProfileKind: OCPP16ChargingProfileKindType.ABSOLUTE,
      chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE,
      chargingSchedule: {
        chargingRateUnit: OCPP16ChargingRateUnitType.AMPERE,
        chargingSchedulePeriod: [{ limit: 16, startPeriod: 0 }],
        duration: 3600,
        startSchedule: new Date(),
      },
      stackLevel: 0,
    }

    // Act — Step 1: Set original
    const setOriginal = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: originalProfile,
    })
    assert.strictEqual(setOriginal.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Act — Step 2: Set replacement (same stackLevel=0, same purpose=TxDefaultProfile)
    const setReplacement = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: replacementProfile,
    })
    assert.strictEqual(setReplacement.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Assert — Only one profile stored (replacement overwrote original)
    const connectorStatus = station.getConnectorStatus(1)
    assert.strictEqual(connectorStatus?.chargingProfiles?.length, 1)
    assert.strictEqual(connectorStatus.chargingProfiles[0].chargingProfileId, 5)
    const storedProfile = connectorStatus.chargingProfiles[0] as OCPP16ChargingProfile | undefined
    assert.strictEqual(storedProfile?.chargingSchedule.chargingSchedulePeriod[0].limit, 16)
  })

  // ============================================================================
  // Clear by Purpose — Only Matching Profiles Cleared
  // ============================================================================

  await it('should clear only profiles matching the specified purpose when clearing by purpose', () => {
    // Arrange
    const { station, testableService } = context

    // Set a TxDefaultProfile on connector 1 (stackLevel 0)
    const txDefaultProfile = ChargingProfileFixtures.createTxDefaultProfile(1, 0)
    txDefaultProfile.chargingSchedule.startSchedule = new Date()
    txDefaultProfile.chargingSchedule.duration = 3600

    // Set a different profile with a different purpose — ChargePointMaxProfile on connector 0
    const chargePointMaxProfile = ChargingProfileFixtures.createChargePointMaxProfile(2)
    chargePointMaxProfile.chargingSchedule.startSchedule = new Date()
    chargePointMaxProfile.chargingSchedule.duration = 3600

    // Set TxDefaultProfile on connector 1
    const setTxDefault = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: txDefaultProfile,
    })
    assert.strictEqual(setTxDefault.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Set ChargePointMaxProfile on connector 0
    const setChargePointMax = testableService.handleRequestSetChargingProfile(station, {
      connectorId: 0,
      csChargingProfiles: chargePointMaxProfile,
    })
    assert.strictEqual(setChargePointMax.status, OCPP16ChargingProfileStatus.ACCEPTED)

    // Verify both connectors have profiles
    assert.strictEqual(station.getConnectorStatus(1)?.chargingProfiles?.length, 1)
    assert.strictEqual(station.getConnectorStatus(0)?.chargingProfiles?.length, 1)

    // Act — Clear only TxDefaultProfile purpose (no connectorId specified → scans all connectors)
    const clearRequest: OCPP16ClearChargingProfileRequest = {
      chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE,
    }
    const clearResponse = testableService.handleRequestClearChargingProfile(station, clearRequest)

    // Assert — Clear accepted (TxDefaultProfile found and cleared)
    assert.strictEqual(clearResponse.status, OCPP16ClearChargingProfileStatus.ACCEPTED)

    // Assert — TxDefaultProfile cleared from connector 1
    assert.strictEqual(station.getConnectorStatus(1)?.chargingProfiles?.length, 0)

    // Assert — ChargePointMaxProfile on connector 0 is untouched
    assert.strictEqual(station.getConnectorStatus(0)?.chargingProfiles?.length, 1)
    assert.strictEqual(station.getConnectorStatus(0)?.chargingProfiles?.[0].chargingProfileId, 2)
  })

  // ============================================================================
  // Clear by Profile ID → Verify Specific Profile Removed
  // ============================================================================

  await it('should clear only the profile with matching ID when clearing by ID', () => {
    // Arrange
    const { station, testableService } = context

    // Set two TxDefaultProfiles with different IDs and stack levels on connector 1
    const profileA = ChargingProfileFixtures.createTxDefaultProfile(10, 0)
    profileA.chargingSchedule.startSchedule = new Date()
    profileA.chargingSchedule.duration = 3600

    const profileB = ChargingProfileFixtures.createTxDefaultProfile(20, 1)
    profileB.chargingSchedule.startSchedule = new Date()
    profileB.chargingSchedule.duration = 3600
    profileB.chargingSchedule.chargingSchedulePeriod = [{ limit: 24, startPeriod: 0 }]

    testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: profileA,
    })
    testableService.handleRequestSetChargingProfile(station, {
      connectorId: 1,
      csChargingProfiles: profileB,
    })

    // Verify both stored
    assert.strictEqual(station.getConnectorStatus(1)?.chargingProfiles?.length, 2)

    // Act — Clear only profile with ID 10
    const clearResponse = testableService.handleRequestClearChargingProfile(station, {
      id: 10,
    })

    // Assert — Clear accepted
    assert.strictEqual(clearResponse.status, OCPP16ClearChargingProfileStatus.ACCEPTED)

    // Assert — Only profile B remains
    const remaining = station.getConnectorStatus(1)?.chargingProfiles
    assert.strictEqual(remaining?.length, 1)
    assert.strictEqual(remaining[0].chargingProfileId, 20)

    // Verify composite schedule still works with remaining profile
    const getResponse = testableService.handleRequestGetCompositeSchedule(station, {
      connectorId: 1,
      duration: 3600,
    })
    assert.strictEqual(getResponse.status, GenericStatus.Accepted)
  })
})
