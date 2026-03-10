/**
 * @file Tests for OCPP16ServiceUtils pure utility functions
 * @description Verifies pure static methods on OCPP16ServiceUtils: meter value building,
 * charging profile management, feature profile checking, and command support checks.
 */

import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { OCPPServiceUtils } from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  type OCPP16ChargingProfile,
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
  type OCPP16ChargingSchedule,
  type OCPP16ClearChargingProfileRequest,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  OCPP16SupportedFeatureProfiles,
  IncomingRequestCommand,
  OCPPVersion,
  RequestCommand,
} from '../../../../src/types/index.js'
import { OCPP16ChargingProfileKindType } from '../../../../src/types/ocpp/1.6/ChargingProfile.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

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
        connectorStatus.MeterValues = [
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ] as unknown as typeof connectorStatus.MeterValues
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 1000)

      // Assert
      expect(meterValue).toBeDefined()
      expect(meterValue.timestamp).toBeInstanceOf(Date)
      expect(Array.isArray(meterValue.sampledValue)).toBe(true)
      expect(meterValue.sampledValue.length).toBe(1)
      expect(meterValue.sampledValue[0].context).toBe(OCPP16MeterValueContext.TRANSACTION_BEGIN)
    })

    await it('should apply Wh unit divider of 1 for meterStart', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ] as unknown as typeof connectorStatus.MeterValues
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      // Assert — Wh divider is 1, so value = 5000 / 1 = 5000
      expect(meterValue.sampledValue[0].value).toBe('5000')
    })

    await it('should apply kWh unit divider of 1000 for meterStart', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.KILO_WATT_HOUR,
            value: '0',
          },
        ] as unknown as typeof connectorStatus.MeterValues
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 5000)

      // Assert — kWh divider is 1000, so value = 5000 / 1000 = 5
      expect(meterValue.sampledValue[0].value).toBe('5')
    })

    await it('should use meterStart 0 when undefined', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ] as unknown as typeof connectorStatus.MeterValues
      }

      // Act
      const meterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(
        station,
        1,
        undefined
      )

      // Assert — undefined meterStart defaults to 0
      expect(meterValue.sampledValue[0].value).toBe('0')
    })

    await it('should throw when MeterValues template is empty (missing default measurand)', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })

      expect(() => {
        OCPP16ServiceUtils.buildTransactionBeginMeterValue(station, 1, 100)
      }).toThrow('Missing MeterValues for default measurand')
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
      expect(result.length).toBe(2)
      expect(result[0]).toBe(beginMeterValue)
      expect(result[1]).toBe(endMeterValue)
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
      expect(result1 !== result2).toBe(true)
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
        connectorStatus.MeterValues = [
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.WATT_HOUR,
            value: '0',
          },
        ] as unknown as typeof connectorStatus.MeterValues
      }

      // Act
      const meterValue = OCPPServiceUtils.buildTransactionEndMeterValue(station, 1, 10000)

      // Assert
      expect(meterValue).toBeDefined()
      expect(meterValue.timestamp).toBeInstanceOf(Date)
      expect(meterValue.sampledValue.length).toBe(1)
      expect(meterValue.sampledValue[0].context).toBe(OCPP16MeterValueContext.TRANSACTION_END)
    })

    await it('should apply kWh unit divider for end meter value', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.MeterValues = [
          {
            measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: OCPP16MeterValueUnit.KILO_WATT_HOUR,
            value: '0',
          },
        ] as unknown as typeof connectorStatus.MeterValues
      }

      // Act
      const meterValue = OCPPServiceUtils.buildTransactionEndMeterValue(station, 1, 3000)

      // Assert — kWh divider: 3000 / 1000 = 3
      expect(meterValue.sampledValue[0].value).toBe('3')
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

      expect(result).toBe(false)
    })

    await it('should return false for empty profiles array', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const payload: OCPP16ClearChargingProfileRequest = { id: 1 }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, [])

      expect(result).toBe(false)
    })

    await it('should clear profile matching by id', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
      ]
      const payload: OCPP16ClearChargingProfileRequest = { id: 1 }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      expect(result).toBe(true)
      // Profile with id 1 should be removed
      expect(profiles.length).toBe(1)
      expect(profiles[0].chargingProfileId).toBe(2)
    })

    await it('should clear profile matching by purpose', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 1),
      ]
      const payload: OCPP16ClearChargingProfileRequest = {
        chargingProfilePurpose: OCPP16ChargingProfilePurposeType.TX_PROFILE,
      }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      expect(result).toBe(true)
      expect(profiles.length).toBe(1)
      expect(profiles[0].chargingProfilePurpose).toBe(
        OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE
      )
    })

    await it('should clear profile matching by stackLevel when purpose is null', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
        makeProfile(2, OCPP16ChargingProfilePurposeType.TX_PROFILE, 5),
      ]
      const payload: OCPP16ClearChargingProfileRequest = { stackLevel: 5 }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      expect(result).toBe(true)
      expect(profiles.length).toBe(1)
      expect(profiles[0].chargingProfileId).toBe(1)
    })

    await it('should return false when no profiles match', () => {
      const { station } = createMockChargingStation({ ocppVersion: OCPPVersion.VERSION_16 })
      const profiles = [
        makeProfile(1, OCPP16ChargingProfilePurposeType.TX_DEFAULT_PROFILE, 0),
      ]
      const payload: OCPP16ClearChargingProfileRequest = { id: 99 }

      const result = OCPP16ServiceUtils.clearChargingProfiles(station, payload, profiles)

      expect(result).toBe(false)
      expect(profiles.length).toBe(1)
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

      expect(result).toBe(undefined)
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

      expect(result).toBeDefined()
      expect(result?.chargingSchedulePeriod[0].limit).toBe(11000)
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

      expect(result).toBeDefined()
      expect(result?.chargingSchedulePeriod[0].limit).toBe(7000)
    })

    await it('should compose non-overlapping schedules', () => {
      // Higher: 0..1800s, Lower: 1800..3600s — non-overlapping
      const compositeInterval = {
        end: new Date(Date.UTC(2025, 0, 1, 1, 0, 0)),
        start: new Date(Date.UTC(2025, 0, 1, 0, 0, 0)),
      }
      const higher = makeSchedule(0, 1800, 11000)
      const lower = makeSchedule(1800, 1800, 7000)

      const result = OCPP16ServiceUtils.composeChargingSchedules(
        higher,
        lower,
        compositeInterval
      )

      expect(result).toBeDefined()
      expect(result?.chargingSchedulePeriod.length).toBe(2)
      // Should be sorted by startPeriod
      const periods = result?.chargingSchedulePeriod ?? []
      expect(periods[0].startPeriod <= periods[1].startPeriod).toBe(true)
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
      expect(result).toBe(true)
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
      expect(result).toBe(false)
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
      expect(result).toBe(false)
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
      const result = OCPP16ServiceUtils.isRequestCommandSupported(
        station,
        OCPP16RequestCommand.HEARTBEAT
      )

      // Assert
      expect(result).toBe(true)
    })

    await it('should return true when command is explicitly enabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: {
            incomingCommands: {} as unknown as Record<IncomingRequestCommand, boolean>,
            outgoingCommands: {
              [OCPP16RequestCommand.HEARTBEAT]: true,
            } as unknown as Record<RequestCommand, boolean>,
          },
        },
      })

      const result = OCPP16ServiceUtils.isRequestCommandSupported(
        station,
        OCPP16RequestCommand.HEARTBEAT
      )

      expect(result).toBe(true)
    })

    await it('should return false when command is explicitly disabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: {
            incomingCommands: {} as unknown as Record<IncomingRequestCommand, boolean>,
            outgoingCommands: {
              [OCPP16RequestCommand.HEARTBEAT]: false,
            } as unknown as Record<RequestCommand, boolean>,
          },
        },
      })

      const result = OCPP16ServiceUtils.isRequestCommandSupported(
        station,
        OCPP16RequestCommand.HEARTBEAT
      )

      expect(result).toBe(false)
    })
  })

  // ─── isIncomingRequestCommandSupported ──────────────────────────────────

  await describe('isIncomingRequestCommandSupported', async () => {
    await it('should return true when incomingCommands is not defined', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { commandsSupport: undefined },
      })

      const result = OCPP16ServiceUtils.isIncomingRequestCommandSupported(
        station,
        OCPP16IncomingRequestCommand.RESET
      )

      expect(result).toBe(true)
    })

    await it('should return true when incoming command is explicitly enabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: {
            incomingCommands: {
              [OCPP16IncomingRequestCommand.RESET]: true,
            } as unknown as Record<IncomingRequestCommand, boolean>,
          },
        },
      })

      const result = OCPP16ServiceUtils.isIncomingRequestCommandSupported(
        station,
        OCPP16IncomingRequestCommand.RESET
      )

      expect(result).toBe(true)
    })

    await it('should return false when incoming command is explicitly disabled', () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          commandsSupport: {
            incomingCommands: {
              [OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION]: false,
            } as unknown as Record<IncomingRequestCommand, boolean>,
          },
        },
      })

      const result = OCPP16ServiceUtils.isIncomingRequestCommandSupported(
        station,
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION
      )

      expect(result).toBe(false)
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

      expect(result).toBe(true)
    })

    await it('should return true when visible is true', () => {
      const result = OCPP16ServiceUtils.isConfigurationKeyVisible({
        key: 'TestKey',
        readonly: false,
        value: 'TestValue',
        visible: true,
      })

      expect(result).toBe(true)
    })

    await it('should return false when visible is false', () => {
      const result = OCPP16ServiceUtils.isConfigurationKeyVisible({
        key: 'TestKey',
        readonly: false,
        value: 'TestValue',
        visible: false,
      })

      expect(result).toBe(false)
    })
  })
})
