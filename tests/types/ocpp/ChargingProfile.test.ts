/**
 * @file Tests for cross-version charging-profile type guards
 * @description Verifies that extension properties cannot change a profile's protocol classification
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isOCPP16ChargingProfile,
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  type OCPP20ChargingProfileType,
  OCPP20ChargingRateUnitEnumType,
} from '../../../src/types/index.js'

await describe('ChargingProfile type guards', async () => {
  await it('should not classify an OCPP 2.0 profile with an extension chargingProfileId as OCPP 1.6', () => {
    const chargingProfile: OCPP20ChargingProfileType = {
      chargingProfileId: 42,
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Absolute,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
      chargingSchedule: [
        {
          chargingRateUnit: OCPP20ChargingRateUnitEnumType.W,
          chargingSchedulePeriod: [{ limit: 11_000, startPeriod: 0 }],
          id: 1,
        },
      ],
      id: 1,
      stackLevel: 0,
    }

    assert.strictEqual(isOCPP16ChargingProfile(chargingProfile), false)
  })
})
