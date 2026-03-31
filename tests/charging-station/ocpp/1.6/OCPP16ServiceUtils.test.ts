/**
 * @file Tests for OCPP16ServiceUtils pure utility functions
 * @module OCPP 1.6 — §4.7 MeterValues (meter value building), §9.3 SetChargingProfile
 *   (charging profile management), §3 ChargePoint status (connector status transitions),
 *   §9.4 ClearChargingProfile (Errata 3.25 AND logic), authorization cache updates
 * @description Verifies pure static methods on OCPP16ServiceUtils: meter value building,
 * charging profile management, feature profile checking, command support checks,
 * and authorization cache update behavior.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  AuthorizationStatus,
  OCPPAuthServiceFactory,
} from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  isIncomingRequestCommandSupported,
  isRequestCommandSupported,
} from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  ChargePointErrorCode,
  OCPP16AuthorizationStatus,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  OCPP16ChargingProfileKindType,
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
  type OCPP16ChargingSchedule,
  type OCPP16ClearChargingProfileRequest,
  type OCPP16IdTagInfo,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16StatusNotificationRequest,
  OCPP16SupportedFeatureProfiles,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createCommandsSupport, createMeterValuesTemplate } from './OCPP16TestUtils.js'

await describe('OCPP16ServiceUtils — pure functions', async () => {
  afterEach(() => {
    standardCleanup()
  })

  // ─── buildTransactionBeginMeterValue ───────────────────────────────────

  await describe('buildTransactionBeginMeterValue', async () => {
    await it('should return a meter value with Transaction.Begin context when template exists', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      // Assert
      assert.notStrictEqual(meterValue, undefined)
      assert.ok(meterValue.timestamp instanceof Date)
      assert.strictEqual(Array.isArray(meterValue.sampledValue), true)
      assert.strictEqual(meterValue.sampledValue.length, 1)
      assert.strictEqual(
        meterValue.sampledValue[0].context,
        OCPP16MeterValueContext.TRANSACTION_BEGIN
      )
    })

    await it('should apply Wh unit divider of 1 for meterStart', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      // Assert — Wh divider is 1, so value = 5000 / 1 = 5000
      assert.strictEqual(meterValue.sampledValue[0].value, '5000')
    })

    await it('should apply kWh unit divider of 1000 for meterStart', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.KILO_WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      // Assert — kWh divider is 1000, so value = 5000 / 1000 = 5
      assert.strictEqual(meterValue.sampledValue[0].value, '5')
    })

    await it('should use meterStart 0 when undefined', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, undefined)

      // Assert — undefined meterStart defaults to 0
      assert.strictEqual(meterValue.sampledValue[0].value, '0')
    })

    await it('should throw when MeterValues template is empty (missing default measurand)', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })

      assert.throws(
        () => {
          OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 100)
        },
        { message: /Missing MeterValues for default measurand/ }
      )
    })
  })

  // ─── buildTransactionDataMeterValues ───────────────────────────────────

  await describe('buildTransactionDataMeterValues', async () => {
    await it('should return array containing both begin and end meter values', () => {
      // Arrange
      const beginMeterValue: OCPP16MeterValue = {
        sampledValue: [{ context: OCPP16MeterValueContext.TRANSACTION_BEGIN, value: '0' }],
        timestamp: new Date('2025-01-01T00:00:00Z'),
      } as OCPP16MeterValue
      const endMeterValue: OCPP16MeterValue = {
        sampledValue: [{ context: OCPP16MeterValueContext.TRANSACTION_END, value: '100' }],
        timestamp: new Date('2025-01-01T01:00:00Z'),
      } as OCPP16MeterValue

      // Act
      const result = OCPP16ServiceUtils.buildTransactionDataMeterValues(
        beginMeterValue,
        endMeterValue
      )

      // Assert
      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0], beginMeterValue)
      assert.strictEqual(result[1], endMeterValue)
    })

    await it('should return a new array instance', () => {
      const beginMeterValue: OCPP16MeterValue = {
        sampledValue: [],
        timestamp: new Date(),
      } as OCPP16MeterValue
      const endMeterValue: OCPP16MeterValue = {
        sampledValue: [],
        timestamp: new Date(),
      } as OCPP16MeterValue

      const result1 = OCPP16ServiceUtils.buildTransactionDataMeterValues(
        beginMeterValue,
        endMeterValue
      )
      const result2 = OCPP16ServiceUtils.buildTransactionDataMeterValues(
        beginMeterValue,
        endMeterValue
      )

      // Different array instances
      assert.notStrictEqual(result1, result2)
    })
  })

  // ─── buildTransactionEndMeterValue ─────────────────────────────────────

  await describe('buildTransactionEndMeterValue', async () => {
    await it('should return a meter value with Transaction.End context', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 10000)

      // Assert
      assert.notStrictEqual(meterValue, undefined)
      assert.ok(meterValue.timestamp instanceof Date)
      assert.strictEqual(meterValue.sampledValue.length, 1)
      assert.strictEqual(
        meterValue.sampledValue[0].context,
        OCPP16MeterValueContext.TRANSACTION_END
      )
    })

    await it('should apply kWh unit divider for end meter value', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = createMeterValuesTemplate([
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.KILO_WATT_HOUR,
            value: '0',
          },
        ])
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(station, 1, 3000)

      // Assert — kWh divider: 3000 / 1000 = 3
      assert.strictEqual(meterValue.sampledValue[0].value, '3')
    })
  })

  // ─── clearChargingProfiles ──────────────────────────────────────────────

  await describe('clearChargingProfiles', async () => {
    /**
     * Creates a minimal OCPP16ChargingProfile fixture.
     * @param id - Profile ID
     * @param purpose - Profile purpose type
     * @param stackLevel - Stack level
     * @returns Charging profile fixture
     */
    function makeProfile (
      id: number,
      purpose: OCPP16ChargingProfilePurposeType,
      stackLevel: number
    ): OCPP16ChargingProfile {
      return {
        chargingProfileId: id,
        chargingProfileKind: OCPP16ChargingProfileKindType.ABSOLUTE,
        chargingProfilePurpose: purpose,
        chargingSchedule: {
          chargingRateUnit: OCPP16ChargingRateUnitType.WATT,
          chargingSchedulePeriod: [{ limit: 1000, startPeriod: 0 }],
        },
        stackLevel,
      } as OCPP16ChargingProfile
    }

    await it('should return false for undefined profiles array', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const payload: OCPP16ClearChargingProfileRequest = { id: 1 }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, undefined)

      assert.strictEqual(result, false)
    })

    await it('should return false for empty profiles array', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const payload: OCPP16ClearChargingProfileRequest = { id: 1 }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, [])

      assert.strictEqual(result, false)
    })

    await it('should clear profile matching by id', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
      ]
      const payload: OCPP16ClearChargingProfileRequest = { id: 1 }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert
      assert.strictEqual(result, true)
      // Profile with id 1 should be removed
      assert.strictEqual(profiles.length, 1)
      assert.strictEqual(profiles[0].chargingProfileId, 2)
    })

    await it('should clear profile matching by purpose', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
      ]
      const payload: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_PROFILE,
      }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert
      assert.strictEqual(result, true)
      assert.strictEqual(profiles.length, 1)
      assert.strictEqual(
        profiles[0].chargingProfilePurpose,
        OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE
      )
    })

    await it('should clear profile matching by stackLevel when purpose is null', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 5),
      ]
      const payload: OCPP16ClearChargingProfileRequest = { stackLevel: 5 }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert
      assert.strictEqual(result, true)
      assert.strictEqual(profiles.length, 1)
      assert.strictEqual(profiles[0].chargingProfileId, 1)
    })

    await it('should return false when no profiles match', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0)]
      const payload: OCPP16ClearChargingProfileRequest = { id: 99 }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert
      assert.strictEqual(result, false)
      assert.strictEqual(profiles.length, 1)
    })

    await it('should clear profile matching all specified criteria (AND logic)', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
        makeProfile(3, OCPP16ChargingProfilePurposeType.TX_PROFILE, 0),
      ]
      const payload: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_PROFILE,
        id: 2,
        stackLevel: 1,
      }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert — only profile 2 matches all three criteria
      assert.strictEqual(result, true)
      assert.strictEqual(profiles.length, 2)
      assert.strictEqual(profiles[0].chargingProfileId, 1)
      assert.strictEqual(profiles[1].chargingProfileId, 3)
    })

    await it('should treat null fields as wildcards', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
        makeProfile(3, OCPP16ChargingProfilePurposeType.TX_PROFILE, 5),
      ]
      const payload: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_PROFILE,
      }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert — id and stackLevel are null (wildcards), so all TxProfile profiles cleared
      assert.strictEqual(result, true)
      assert.strictEqual(profiles.length, 1)
      assert.strictEqual(profiles[0].chargingProfileId, 1)
    })

    await it('should not clear profile when only some criteria match', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
      ]
      const payload: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_PROFILE,
        id: 1,
      }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert — id=1 matches P1 but purpose doesn't; purpose matches P2 but id doesn't
      assert.strictEqual(result, false)
      assert.strictEqual(profiles.length, 2)
    })

    await it('should clear multiple matching profiles', () => {
      // Arrange
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(3, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
      ]
      const payload: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE,
        stackLevel: 0,
      }

      // Act
      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      // Assert — profiles 1 and 2 both match purpose + stackLevel
      assert.strictEqual(result, true)
      assert.strictEqual(profiles.length, 1)
      assert.strictEqual(profiles[0].chargingProfileId, 3)
    })
  })

  // ─── composeChargingSchedules ──────────────────────────────────────────

  await describe('composeChargingSchedules', async () => {
    /**
     * Creates a minimal OCPP16ChargingSchedule fixture.
     * @param startSeconds - Start offset in seconds from epoch
     * @param durationSeconds - Duration in seconds
     * @param limit - Power limit in watts
     * @returns Charging schedule fixture
     */
    function makeSchedule (
      startSeconds: number,
      durationSeconds: number,
      limit: number
    ): OCPP16ChargingSchedule {
      const start = new Date(Date.UTC(2025, 0, 1, 0, 0, startSeconds))
      return {
        chargingRateUnit: OCPP16ChargingRateUnitType.WATT,
        chargingSchedulePeriod: [{ limit, startPeriod: 0 }],
        duration: durationSeconds,
        startSchedule: start,
      } as OCPP16ChargingSchedule
    }

    await it('should return undefined when both schedules are undefined', () => {
      const compositeInterval = {
        end: new Date(Date.UTC(2025, 0, 1, 1, 0, 0)),
        start: new Date(Date.UTC(2025, 0, 1, 0, 0, 0)),
      }

      const result = OCPP16ServiceUtils.composeChargingSchedules(
        undefined,
        undefined,
        compositeInterval
      )

      assert.strictEqual(result, undefined)
    })

    await it('should return higher schedule when lower is undefined', () => {
      const compositeInterval = {
        end: new Date(Date.UTC(2025, 0, 1, 1, 0, 0)),
        start: new Date(Date.UTC(2025, 0, 1, 0, 0, 0)),
      }
      const higher = makeSchedule(0, 3600, 11000)

      const result = OCPP16ServiceUtils.composeChargingSchedules(
        higher,
        undefined,
        compositeInterval
      )

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.chargingSchedulePeriod[0].limit, 11000)
    })

    await it('should return lower schedule when higher is undefined', () => {
      const compositeInterval = {
        end: new Date(Date.UTC(2025, 0, 1, 1, 0, 0)),
        start: new Date(Date.UTC(2025, 0, 1, 0, 0, 0)),
      }
      const lower = makeSchedule(0, 3600, 7000)

      const result = OCPP16ServiceUtils.composeChargingSchedules(
        undefined,
        lower,
        compositeInterval
      )

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.chargingSchedulePeriod[0].limit, 7000)
    })

    await it('should compose non-overlapping schedules', () => {
      // Arrange — Higher: 0..1800s, Lower: 1800..3600s — non-overlapping
      const compositeInterval = {
        end: new Date(Date.UTC(2025, 0, 1, 1, 0, 0)),
        start: new Date(Date.UTC(2025, 0, 1, 0, 0, 0)),
      }
      const higher = makeSchedule(0, 1800, 11000)
      const lower = makeSchedule(1800, 1800, 7000)

      // Act
      const result = OCPP16ServiceUtils.composeChargingSchedules(higher, lower, compositeInterval)

      // Assert
      assert.notStrictEqual(result, undefined)
      if (result == null) {
        assert.fail('Expected result to be defined')
      }
      assert.strictEqual(result.chargingSchedulePeriod.length, 2)
      // Should be sorted by startPeriod
      const periods = result.chargingSchedulePeriod
      assert.ok(periods[0].startPeriod <= periods[1].startPeriod)
    })
  })

  // ─── checkFeatureProfile ───────────────────────────────────────────────

  await describe('checkFeatureProfile', async () => {
    await it('should return true when feature profile is in configuration', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppConfiguration: {
          configurationKey: [
            {
              key: OCPP16StandardParametersKey.SupportedFeatureProfiles,
              readonly: true,
              value: 'Core,SmartCharging',
            },
          ],
        },
        ocppVersion: OCPPVersion.VERSION_16,
      })

      // Act
      const result = OCPP16ServiceUtils.checkFeatureProfile(
        station,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16RequestCommand.METER_VALUES
      )

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should return false when feature profile is not in configuration', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppConfiguration: {
          configurationKey: [
            {
              key: OCPP16StandardParametersKey.SupportedFeatureProfiles,
              readonly: true,
              value: 'Core',
            },
          ],
        },
        ocppVersion: OCPPVersion.VERSION_16,
      })

      // Act
      const result = OCPP16ServiceUtils.checkFeatureProfile(
        station,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE
      )

      // Assert
      assert.strictEqual(result, false)
    })

    await it('should return false when SupportedFeatureProfiles key is missing', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppConfiguration: { configurationKey: [] },
        ocppVersion: OCPPVersion.VERSION_16,
      })

      // Act
      const result = OCPP16ServiceUtils.checkFeatureProfile(
        station,
        OCPP16SupportedFeatureProfiles.Reservation,
        OCPP16IncomingRequestCommand.RESERVE_NOW
      )

      // Assert
      assert.strictEqual(result, false)
    })
  })

  // ─── isRequestCommandSupported ──────────────────────────────────────────

  await describe('isRequestCommandSupported', async () => {
    await it('should return true when commandsSupport is not defined', () => {
      // Arrange — no commandsSupport means all commands supported
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { commandsSupport: undefined },
      })

      // Act
      const result = isRequestCommandSupported(station, OCPP16RequestCommand.HEARTBEAT)

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should return true when command is explicitly enabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: createCommandsSupport({
            incomingCommands: {},
            outgoingCommands: {
              [OCPP16RequestCommand.HEARTBEAT]: true,
            },
          }),
        },
      })

      const result = isRequestCommandSupported(station, OCPP16RequestCommand.HEARTBEAT)

      assert.strictEqual(result, true)
    })

    await it('should return false when command is explicitly disabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: createCommandsSupport({
            incomingCommands: {},
            outgoingCommands: {
              [OCPP16RequestCommand.HEARTBEAT]: false,
            },
          }),
        },
      })

      const result = isRequestCommandSupported(station, OCPP16RequestCommand.HEARTBEAT)

      assert.strictEqual(result, false)
    })
  })

  // ─── isIncomingRequestCommandSupported ──────────────────────────────────

  await describe('isIncomingRequestCommandSupported', async () => {
    await it('should return true when incomingCommands is not defined', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { commandsSupport: undefined },
      })

      const result = isIncomingRequestCommandSupported(station, OCPP16IncomingRequestCommand.RESET)

      assert.strictEqual(result, true)
    })

    await it('should return true when incoming command is explicitly enabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: createCommandsSupport({
            incomingCommands: {
              [OCPP16IncomingRequestCommand.RESET]: true,
            },
          }),
        },
      })

      const result = isIncomingRequestCommandSupported(station, OCPP16IncomingRequestCommand.RESET)

      assert.strictEqual(result, true)
    })

    await it('should return false when incoming command is explicitly disabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: createCommandsSupport({
            incomingCommands: {
              [OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION]: false,
            },
          }),
        },
      })

      const result = isIncomingRequestCommandSupported(
        station,
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION
      )

      assert.strictEqual(result, false)
    })
  })

  // ─── buildStatusNotificationRequest ─────────────────────────────────────

  await describe('buildStatusNotificationRequest', async () => {
    await it('should return payload with NO_ERROR error code', () => {
      const input: OCPP16StatusNotificationRequest = {
        connectorId: 1,
        errorCode: ChargePointErrorCode.NO_ERROR,
        status: OCPP16ChargePointStatus.Available,
      }

      const result = OCPP16ServiceUtils.buildStatusNotificationRequest(input)

      assert.strictEqual(result.errorCode, ChargePointErrorCode.NO_ERROR)
    })

    await it('should preserve connectorId from input', () => {
      const input: OCPP16StatusNotificationRequest = {
        connectorId: 2,
        errorCode: ChargePointErrorCode.NO_ERROR,
        status: OCPP16ChargePointStatus.Charging,
      }

      const result = OCPP16ServiceUtils.buildStatusNotificationRequest(input)

      assert.strictEqual(result.connectorId, 2)
    })

    await it('should preserve status from input', () => {
      const input: OCPP16StatusNotificationRequest = {
        connectorId: 1,
        errorCode: ChargePointErrorCode.NO_ERROR,
        status: OCPP16ChargePointStatus.Charging,
      }

      const result = OCPP16ServiceUtils.buildStatusNotificationRequest(input)

      assert.strictEqual(result.status, OCPP16ChargePointStatus.Charging)
    })

    await it('should always set errorCode to NO_ERROR regardless of input errorCode', () => {
      const input: OCPP16StatusNotificationRequest = {
        connectorId: 1,
        errorCode: ChargePointErrorCode.CONNECTOR_LOCK_FAILURE,
        status: OCPP16ChargePointStatus.Faulted,
      }

      const result = OCPP16ServiceUtils.buildStatusNotificationRequest(input)

      assert.strictEqual(result.errorCode, ChargePointErrorCode.NO_ERROR)
    })
  })

  // ─── isConfigurationKeyVisible ─────────────────────────────────────────

  await describe('isConfigurationKeyVisible', async () => {
    await it('should return true when visible is undefined', () => {
      const result = OCPP16ServiceUtils.isConfigurationKeyVisible({
        key: 'TestKey',
        readonly: false,
        value: 'TestValue',
      })

      assert.strictEqual(result, true)
    })

    await it('should return true when visible is true', () => {
      const result = OCPP16ServiceUtils.isConfigurationKeyVisible({
        key: 'TestKey',
        readonly: false,
        value: 'TestValue',
        visible: true,
      })

      assert.strictEqual(result, true)
    })

    await it('should return false when visible is false', () => {
      const result = OCPP16ServiceUtils.isConfigurationKeyVisible({
        key: 'TestKey',
        readonly: false,
        value: 'TestValue',
        visible: false,
      })

      assert.strictEqual(result, false)
    })
  })

  // ─── updateAuthorizationCache ──────────────────────────────────────────

  await describe('updateAuthorizationCache', async () => {
    const TEST_ID_TAG = 'TEST_RFID_001'

    afterEach(() => {
      OCPPAuthServiceFactory.clearAllInstances()
    })

    await it('should update auth cache with Accepted status', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: 'CS_CACHE_TEST_01',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      const idTagInfo: OCPP16IdTagInfo = {
        status: OCPP16AuthorizationStatus.ACCEPTED,
      }

      // Act
      OCPP16ServiceUtils.updateAuthorizationCache(station, TEST_ID_TAG, idTagInfo)

      // Assert
      const authService = OCPPAuthServiceFactory.getInstance(station)
      const authCache = authService.getAuthCache()
      assert.ok(authCache != null)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null)
      assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
    })

    await it('should update auth cache with rejected status', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: 'CS_CACHE_TEST_02',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      const idTagInfo: OCPP16IdTagInfo = {
        status: OCPP16AuthorizationStatus.BLOCKED,
      }

      // Act
      OCPP16ServiceUtils.updateAuthorizationCache(station, TEST_ID_TAG, idTagInfo)

      // Assert
      const authService = OCPPAuthServiceFactory.getInstance(station)
      const authCache = authService.getAuthCache()
      assert.ok(authCache != null)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null)
      assert.strictEqual(cached.status, AuthorizationStatus.BLOCKED)
    })

    await it('should set TTL from expiryDate when in future', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: 'CS_CACHE_TEST_03',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      const futureDate = new Date(Date.now() + 600_000)
      const idTagInfo: OCPP16IdTagInfo = {
        expiryDate: futureDate,
        status: OCPP16AuthorizationStatus.ACCEPTED,
      }

      // Act
      OCPP16ServiceUtils.updateAuthorizationCache(station, TEST_ID_TAG, idTagInfo)

      // Assert
      const authService = OCPPAuthServiceFactory.getInstance(station)
      const authCache = authService.getAuthCache()
      assert.ok(authCache != null)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null, 'Cache entry should exist with future TTL')
      assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
    })

    await it('should skip caching when expiryDate is in the past', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: 'CS_CACHE_TEST_04',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      const pastDate = new Date(Date.now() - 60_000)
      const idTagInfo: OCPP16IdTagInfo = {
        expiryDate: pastDate,
        status: OCPP16AuthorizationStatus.ACCEPTED,
      }

      // Act
      OCPP16ServiceUtils.updateAuthorizationCache(station, TEST_ID_TAG, idTagInfo)

      // Assert
      const authService = OCPPAuthServiceFactory.getInstance(station)
      const authCache = authService.getAuthCache()
      assert.ok(authCache != null)
      const cached = authCache.get(TEST_ID_TAG)
      assert.strictEqual(cached, undefined, 'Expired entry must not be cached')
    })

    await it('should cache without TTL when no expiryDate', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: 'CS_CACHE_TEST_05',
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      const idTagInfo: OCPP16IdTagInfo = {
        status: OCPP16AuthorizationStatus.ACCEPTED,
      }

      // Act
      OCPP16ServiceUtils.updateAuthorizationCache(station, TEST_ID_TAG, idTagInfo)

      // Assert
      const authService = OCPPAuthServiceFactory.getInstance(station)
      const authCache = authService.getAuthCache()
      assert.ok(authCache != null)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null, 'Cache entry should exist without TTL')
      assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
    })
  })
})
