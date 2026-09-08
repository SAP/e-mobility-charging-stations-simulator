/**
 * @file Tests for OCPP16ServiceUtils pure utility functions
 * @module OCPP 1.6 — §9.3 SetChargingProfile (charging profile management), §3 ChargePoint status
 *   (connector status transitions), §9.4 ClearChargingProfile (Errata 3.25 AND logic),
 *   authorization cache updates
 * @description Verifies pure static methods on OCPP16ServiceUtils: charging profile management,
 * feature profile checking, command support checks, and authorization cache update behavior.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import {
  AuthResultStatus,
  OCPPAuthServiceFactory,
} from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  isIncomingRequestCommandSupported,
  isRequestCommandSupported,
} from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  ChargePointErrorCode,
  ErrorType,
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
  OCPP16MeterValueFormat,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16StatusNotificationRequest,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  OCPP16SupportedFeatureProfiles,
  OCPP16VendorParametersKey,
  OCPPVersion,
} from '../../../../src/types/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_ID_TAG,
  TEST_PUBLIC_KEY_HEX,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { getTestAuthCache } from '../auth/helpers/MockFactories.js'
import {
  createCommandsSupport,
  createMeterValuesTemplate,
  createOCPP16RequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

await describe('OCPP16ServiceUtils — pure functions', async () => {
  afterEach(() => {
    standardCleanup()
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
      }
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
      }
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
      assert.ok(
        periods[0].startPeriod <= periods[1].startPeriod,
        'periods should be sorted by startPeriod'
      )
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

    await it('should pass through provided errorCode', () => {
      const input: OCPP16StatusNotificationRequest = {
        connectorId: 1,
        errorCode: ChargePointErrorCode.CONNECTOR_LOCK_FAILURE,
        status: OCPP16ChargePointStatus.Faulted,
      }

      const result = OCPP16ServiceUtils.buildStatusNotificationRequest(input)

      assert.strictEqual(result.errorCode, ChargePointErrorCode.CONNECTOR_LOCK_FAILURE)
    })

    await it('should pass through undefined errorCode when not set in payload', () => {
      const input = {
        connectorId: 1,
        status: OCPP16ChargePointStatus.Available,
      } as unknown as OCPP16StatusNotificationRequest

      const result = OCPP16ServiceUtils.buildStatusNotificationRequest(input)

      assert.strictEqual(result.errorCode, undefined)
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

  // ─── stopTransactionOnConnector ────────────────────────────────────────

  await describe('stopTransactionOnConnector', async () => {
    const configureSignedStop = (station: ChargingStation, transactionId: number): void => {
      setupConnectorWithTransaction(station, 1, { energyImport: 1234, transactionId })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.MeterValues = createMeterValuesTemplate([
        {
          measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: OCPP16MeterValueUnit.WATT_HOUR,
          value: '0',
        },
      ])
      connectorStatus.publicKeySentInTransaction = false
      connectorStatus.transactionBeginMeterValue = {
        sampledValue: [{ value: '0' }],
        timestamp: new Date('2026-09-08T09:00:00.000Z'),
      }
      upsertConfigurationKey(station, OCPP16VendorParametersKey.SampledDataSignReadings, 'true')
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
        'OncePerTransaction'
      )
      upsertConfigurationKey(
        station,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )
    }

    await it('should return one in-flight promise per connector and allow a later retry', async () => {
      const stopResponse = Promise.withResolvers<OCPP16StopTransactionResponse>()
      const stopRequestStarted = Promise.withResolvers<undefined>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopRequestStarted.resolve(undefined)
          return await stopResponse.promise
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      const firstStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      await stopRequestStarted.promise
      const joinedStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      assert.strictEqual(joinedStop, firstStop)
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )

      stopResponse.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
      await firstStop

      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STOP_TRANSACTION
        ).length,
        2
      )
    })

    await it('should reject timestamps outside the exact RFC3339 grammar and value ranges', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      const invalidTimestamps: unknown[] = [
        '2026-09-08 12:34:56Z',
        '2026-09-08\t12:34:56Z',
        '2026-09-08T12:34:56+0130',
        '2026-09-08',
        1_788_867_296_000,
        null,
        undefined,
        new Date(Number.NaN),
        '2023-02-29T12:34:56Z',
        '2024-02-30T12:34:56Z',
        '2026-04-31T12:34:56Z',
        '2026-13-01T12:34:56Z',
        '2026-09-08T24:00:00Z',
        '2026-09-08T12:60:00Z',
        '2026-09-08T12:34:61Z',
        '2026-09-08T12:34:56+24:00',
        '2026-09-08T12:34:56-01:60',
        '2026-09-08T12:34:60Z',
        '2016-12-31T23:59:60-00:30',
        '2017-01-01T00:59:60+00:30',
        '0000-01-01T00:00:00+00:01',
        '9999-12-31T23:59:59-00:01',
        new Date(-62_167_219_200_001),
        new Date(253_402_300_800_000),
      ]

      await Promise.all(
        invalidTimestamps.map(async timestamp => {
          await assert.rejects(
            OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
              timestamp,
            } as unknown as Partial<OCPP16StopTransactionRequest>),
            (error: Error) => {
              assert.ok(error instanceof OCPPError)
              assert.strictEqual(error.code, ErrorType.FORMAT_VIOLATION)
              return true
            }
          )
        })
      )
      assert.strictEqual(requestHandler.mock.callCount(), 0)
    })

    await it('should preserve fractional milliseconds and timezone instants', async () => {
      const timestamps = [
        ['2024-02-29T23:59:59Z', '2024-02-29T23:59:59.000Z'],
        ['2026-09-08t12:34:56z', '2026-09-08T12:34:56.000Z'],
        ['2026-09-08T12:34:56.1z', '2026-09-08T12:34:56.100Z'],
        ['2026-09-08T12:34:56.123456789Z', '2026-09-08T12:34:56.123Z'],
        ['2026-09-08T12:34:56.789+02:30', '2026-09-08T10:04:56.789Z'],
        ['2026-09-08T12:34:56.042-03:15', '2026-09-08T15:49:56.042Z'],
      ] as const

      await Promise.all(
        timestamps.map(async ([timestamp, expected]) => {
          let stopRequest: OCPP16StopTransactionRequest | undefined
          const requestHandler = mock.fn((...args: unknown[]) => {
            if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
              stopRequest = args[2] as OCPP16StopTransactionRequest
            }
            return Promise.resolve({})
          })
          const { station } = createMockChargingStation({
            ocppRequestService: { requestHandler },
            ocppVersion: OCPPVersion.VERSION_16,
          })
          setupConnectorWithTransaction(station, 1, { transactionId: 100 })

          await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
            timestamp,
          } as unknown as Partial<OCPP16StopTransactionRequest>)

          assert.strictEqual(stopRequest?.timestamp.toISOString(), expected)
        })
      )
    })

    await it('should normalize leap seconds with Z and offset timestamps', async () => {
      const timestamps = [
        ['2016-12-31T23:59:60Z', '2017-01-01T00:00:00.000Z'],
        ['2017-01-01t00:59:60.125+01:00', '2017-01-01T00:00:00.125Z'],
        ['2017-06-30T22:59:60.250-01:00', '2017-07-01T00:00:00.250Z'],
      ] as const

      await Promise.all(
        timestamps.map(async ([timestamp, expected]) => {
          let stopRequest: OCPP16StopTransactionRequest | undefined
          const requestHandler = mock.fn((...args: unknown[]) => {
            if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
              stopRequest = args[2] as OCPP16StopTransactionRequest
            }
            return Promise.resolve({})
          })
          const { station } = createMockChargingStation({
            ocppRequestService: { requestHandler },
            ocppVersion: OCPPVersion.VERSION_16,
          })
          setupConnectorWithTransaction(station, 1, { transactionId: 100 })

          await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
            timestamp,
          } as unknown as Partial<OCPP16StopTransactionRequest>)

          assert.strictEqual(stopRequest?.timestamp.toISOString(), expected)
        })
      )
    })

    await it('should accept and snapshot a valid Date timestamp', async () => {
      const timestamp = new Date('2026-09-08T12:34:56.789Z')
      let stopRequest: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopRequest = args[2] as OCPP16StopTransactionRequest
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, { timestamp })

      assert.notStrictEqual(stopRequest?.timestamp, timestamp)
      assert.strictEqual(stopRequest?.timestamp.toISOString(), timestamp.toISOString())
    })

    await it('should reject malformed nested transactionData before stop state mutates', async () => {
      const { requestService, station } = createOCPP16RequestTestContext({
        stationInfo: { ocppStrictCompliance: true },
      })
      const requestHandler = mock.fn(() => Promise.resolve({}))
      station.ocppRequestService = {
        requestHandler,
        validateRequestPayload: requestService.validateRequestPayload.bind(requestService),
      } as unknown as ChargingStation['ocppRequestService']
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.status = OCPP16ChargePointStatus.Charging
      const meterValuesTimer = setInterval(() => undefined, 60_000)
      connectorStatus.transactionUpdatedMeterValuesSetInterval = meterValuesTimer

      try {
        await assert.rejects(
          OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
            transactionData: [
              {
                sampledValue: [null],
                timestamp: new Date('2026-09-08T12:34:56.000Z'),
              },
            ],
          } as unknown as Partial<OCPP16StopTransactionRequest>),
          error => {
            assert.ok(error instanceof OCPPError)
            return true
          }
        )

        assert.strictEqual(connectorStatus.status, OCPP16ChargePointStatus.Charging)
        assert.strictEqual(
          connectorStatus.transactionUpdatedMeterValuesSetInterval,
          meterValuesTimer
        )
        assert.strictEqual(requestHandler.mock.callCount(), 0)
      } finally {
        clearInterval(meterValuesTimer)
        delete connectorStatus.transactionUpdatedMeterValuesSetInterval
      }
    })

    await it('should preserve malformed nested transactionData when strict compliance is disabled', async () => {
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      const malformedTransactionData = { unexpected: true }

      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
        transactionData: malformedTransactionData,
      } as unknown as Partial<OCPP16StopTransactionRequest>)

      assert.deepStrictEqual(stopPayload?.transactionData, malformedTransactionData)
    })

    await it('should validate and dispatch one isolated snapshot with valid nested transactionData', async () => {
      const { requestService, station } = createOCPP16RequestTestContext({
        stationInfo: { ocppStrictCompliance: true },
      })
      const statusRequestStarted = Promise.withResolvers<undefined>()
      const statusResponse = Promise.withResolvers<unknown>()
      let stopPayload: Readonly<OCPP16StopTransactionRequest> | undefined
      let stopParams: undefined | { rawPayload?: boolean }
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STATUS_NOTIFICATION) {
          statusRequestStarted.resolve(undefined)
          return await statusResponse.promise
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as Readonly<OCPP16StopTransactionRequest>
          stopParams = args[3] as { rawPayload?: boolean }
        }
        return {}
      })
      station.ocppRequestService = {
        requestHandler,
        validateRequestPayload: requestService.validateRequestPayload.bind(requestService),
      } as unknown as ChargingStation['ocppRequestService']
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.status = OCPP16ChargePointStatus.Charging
      const transactionData: OCPP16MeterValue[] = [
        {
          sampledValue: [
            {
              context: OCPP16MeterValueContext.TRANSACTION_END,
              measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
              unit: OCPP16MeterValueUnit.WATT_HOUR,
              value: '1234',
            },
          ],
          timestamp: new Date('2026-09-08T12:34:56.000Z'),
        },
      ]
      const expectedTransactionData = structuredClone(transactionData)

      const stop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
        transactionData,
      })
      await statusRequestStarted.promise
      transactionData[0].sampledValue[0].value = 'mutated-after-validation'
      transactionData.push({ sampledValue: [{ value: 'late' }], timestamp: new Date() })
      statusResponse.resolve({})
      await stop

      assert.ok(stopPayload != null)
      assert.deepStrictEqual(stopPayload.transactionData, expectedTransactionData)
      assert.notStrictEqual(stopPayload.transactionData, transactionData)
      assert.strictEqual(Object.isFrozen(stopPayload), true)
      assert.strictEqual(stopParams?.rawPayload, true)
    })

    await it('should validate an explicit timestamp before joining but allow omission to join', async () => {
      const stopResponse = Promise.withResolvers<OCPP16StopTransactionResponse>()
      const stopRequestStarted = Promise.withResolvers<undefined>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopRequestStarted.resolve(undefined)
          return await stopResponse.promise
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      const firstStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      await stopRequestStarted.promise
      const invalidJoin = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1, undefined, {
        timestamp: 'not-a-timestamp',
      } as unknown as Partial<OCPP16StopTransactionRequest>)
      const omittedJoin = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      await assert.rejects(invalidJoin, (error: Error) => {
        assert.ok(error instanceof OCPPError)
        assert.strictEqual(error.code, ErrorType.FORMAT_VIOLATION)
        return true
      })
      assert.strictEqual(omittedJoin, firstStop)
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )

      stopResponse.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
      await firstStop
    })

    await it('should force strict StopTransaction errors for every joiner and clear the failed operation', async () => {
      const failure = new Error('StopTransaction CALLERROR')
      let stopAttempts = 0
      const onMessageSent = mock.fn()
      const requestHandler = mock.fn((...args: unknown[]) => {
        if (args[1] !== OCPP16RequestCommand.STOP_TRANSACTION) {
          return Promise.resolve({})
        }
        stopAttempts++
        assert.deepStrictEqual(args[3], {
          onMessageSent,
          rawPayload: true,
          responseTimeoutMs: 25,
          skipBufferingOnError: true,
          throwError: true,
        })
        if (stopAttempts === 1) {
          return Promise.reject(failure)
        }
        return Promise.resolve({
          idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
        })
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      const firstStop = OCPP16ServiceUtils.stopTransactionOnConnector(
        station,
        1,
        undefined,
        {},
        {
          onMessageSent,
          responseTimeoutMs: 25,
          skipBufferingOnError: true,
          throwError: false,
        }
      )
      const joinedStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      assert.strictEqual(joinedStop, firstStop)
      const failedStops = await Promise.allSettled([firstStop, joinedStop])
      assert.deepStrictEqual(
        failedStops.map(result => result.status),
        ['rejected', 'rejected']
      )
      assert.ok(
        failedStops.every(result => result.status === 'rejected' && result.reason === failure)
      )

      await OCPP16ServiceUtils.stopTransactionOnConnector(
        station,
        1,
        undefined,
        {},
        {
          onMessageSent,
          responseTimeoutMs: 25,
          skipBufferingOnError: true,
          throwError: false,
        }
      )
      assert.strictEqual(stopAttempts, 2)
    })

    await it('should keep one recoverable stop intent and the active meter timer after send failure', async () => {
      const sendFailure = new Error('StopTransaction send failure')
      let stopAttempts = 0
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopAttempts++
          if (stopAttempts === 1) return Promise.reject(sendFailure)
          return Promise.resolve({
            idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
          })
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.status = OCPP16ChargePointStatus.Charging
      const meterValuesTimer = setInterval(() => undefined, 60_000)
      connectorStatus.transactionUpdatedMeterValuesSetInterval = meterValuesTimer

      try {
        const firstStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
        const joinedStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

        assert.strictEqual(joinedStop, firstStop)
        const failedStops = await Promise.allSettled([firstStop, joinedStop])
        assert.ok(
          failedStops.every(result => result.status === 'rejected' && result.reason === sendFailure)
        )
        assert.strictEqual(stopAttempts, 1)
        assert.strictEqual(
          connectorStatus.transactionUpdatedMeterValuesSetInterval,
          meterValuesTimer
        )
        assert.strictEqual(connectorStatus.transactionStarted, true)
        assert.strictEqual(connectorStatus.transactionId, 100)

        await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

        assert.strictEqual(stopAttempts, 2)
        assert.strictEqual(
          connectorStatus.transactionUpdatedMeterValuesSetInterval,
          meterValuesTimer
        )
      } finally {
        clearInterval(meterValuesTimer)
        delete connectorStatus.transactionUpdatedMeterValuesSetInterval
      }
    })

    await it('should retry a key-bearing stop after Finishing fails before dispatch', async () => {
      const finishingFailure = new Error('Finishing failed before StopTransaction dispatch')
      let finishingAttempts = 0
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP16RequestCommand.STATUS_NOTIFICATION) {
          finishingAttempts++
          if (finishingAttempts === 1) return Promise.reject(finishingFailure)
          return Promise.resolve({})
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
          ;(args[3] as { onMessageSent?: () => void }).onMessageSent?.()
          return Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)

      await assert.rejects(OCPP16ServiceUtils.stopTransactionOnConnector(station, 1), error => {
        assert.strictEqual(error, finishingFailure)
        return true
      })
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)

      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      const signedSample = stopPayload?.transactionData
        ?.flatMap(meterValue => meterValue.sampledValue)
        .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
      assert.ok(signedSample != null)
      const signedMeterValue = JSON.parse(signedSample.value) as { publicKey: string }
      assert.notStrictEqual(signedMeterValue.publicKey, '')
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    })

    await it('should retry a key-bearing stop after an unbuffered pre-send failure', async () => {
      const sendFailure = new Error('StopTransaction pre-send failure')
      const stopPayloads: OCPP16StopTransactionRequest[] = []
      let stopAttempts = 0
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopAttempts++
          stopPayloads.push(args[2] as OCPP16StopTransactionRequest)
          const params = args[3] as {
            onMessageSent?: () => void
            skipBufferingOnError?: boolean
          }
          assert.strictEqual(params.skipBufferingOnError, true)
          if (stopAttempts === 1) return Promise.reject(sendFailure)
          params.onMessageSent?.()
          return Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)

      await assert.rejects(OCPP16ServiceUtils.stopTransactionOnConnector(station, 1), error => {
        assert.strictEqual(error, sendFailure)
        return true
      })
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      assert.strictEqual(stopPayloads.length, 2)
      for (const payload of stopPayloads) {
        const signedSample = payload.transactionData
          ?.flatMap(meterValue => meterValue.sampledValue)
          .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
        assert.ok(signedSample != null)
        assert.notStrictEqual(
          (JSON.parse(signedSample.value) as { publicKey: string }).publicKey,
          ''
        )
      }
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    })

    await it('should not roll a failed stop reservation into a replacement transaction', async () => {
      const statusRequestStarted = Promise.withResolvers<undefined>()
      const statusResponse = Promise.withResolvers<unknown>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STATUS_NOTIFICATION) {
          statusRequestStarted.resolve(undefined)
          return await statusResponse.promise
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)

      const stop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      await statusRequestStarted.promise
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      connectorStatus.transactionId = 200
      connectorStatus.publicKeySentInTransaction = false
      statusResponse.reject(new Error('Finishing failed'))

      await assert.rejects(stop, /Finishing failed/)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
    })

    await it('should not commit an old transaction key into replacement state after dispatch', async () => {
      const statusRequestStarted = Promise.withResolvers<undefined>()
      const statusResponse = Promise.withResolvers<unknown>()
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STATUS_NOTIFICATION) {
          statusRequestStarted.resolve(undefined)
          return await statusResponse.promise
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
          ;(args[3] as { onMessageSent?: () => void }).onMessageSent?.()
          return { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)

      const stop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      await statusRequestStarted.promise
      connectorStatus.transactionId = 200
      connectorStatus.publicKeySentInTransaction = false
      statusResponse.resolve({})
      await stop

      const signedSample = stopPayload?.transactionData
        ?.flatMap(meterValue => meterValue.sampledValue)
        .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
      assert.ok(signedSample != null)
      assert.notStrictEqual((JSON.parse(signedSample.value) as { publicKey: string }).publicKey, '')
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
    })

    await it('should retain the public-key commit after a dispatched stop later fails', async () => {
      const deliveryFailure = new Error('StopTransaction response failed')
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
          ;(args[3] as { onMessageSent?: () => void }).onMessageSent?.()
          return Promise.reject(deliveryFailure)
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          meterSerialNumber: 'SIM-001',
          ocppVersion: OCPPVersion.VERSION_16,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)

      await assert.rejects(OCPP16ServiceUtils.stopTransactionOnConnector(station, 1), error => {
        assert.strictEqual(error, deliveryFailure)
        return true
      })

      const signedSample = stopPayload?.transactionData
        ?.flatMap(meterValue => meterValue.sampledValue)
        .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
      assert.ok(signedSample != null)
      assert.notStrictEqual((JSON.parse(signedSample.value) as { publicKey: string }).publicKey, '')
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    })

    await it('should send a OncePerTransaction end key only in the first strict frame', async () => {
      let meterValuesPayload: undefined | { meterValue: OCPP16MeterValue[] }
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP16RequestCommand.METER_VALUES) {
          meterValuesPayload = args[2] as { meterValue: OCPP16MeterValue[] }
          const params = args[3] as {
            onMessageSent?: () => void
            skipBufferingOnError?: boolean
          }
          assert.strictEqual(params.skipBufferingOnError, true)
          params.onMessageSent?.()
          return Promise.resolve({})
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
          return Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler, validateRequestPayload: () => true },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          beginEndMeterValues: true,
          meterSerialNumber: 'SIM-001',
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_16,
          outOfOrderEndMeterValues: false,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)

      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      assert.ok(meterValuesPayload != null)
      assert.ok(stopPayload?.transactionData != null)
      const meterValuesSignedSample = meterValuesPayload.meterValue[0].sampledValue.find(
        sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      const stopSignedSample = stopPayload.transactionData
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
      assert.ok(meterValuesSignedSample != null)
      assert.ok(stopSignedSample != null)
      assert.notStrictEqual(
        (JSON.parse(meterValuesSignedSample.value) as { publicKey: string }).publicKey,
        ''
      )
      assert.strictEqual(
        (JSON.parse(stopSignedSample.value) as { publicKey: string }).publicKey,
        ''
      )
    })

    await it('should retain end keys in both strict frames for EveryMeterValue', async () => {
      let meterValuesPayload: undefined | { meterValue: OCPP16MeterValue[] }
      let stopPayload: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP16RequestCommand.METER_VALUES) {
          meterValuesPayload = args[2] as { meterValue: OCPP16MeterValue[] }
          ;(args[3] as { onMessageSent?: () => void }).onMessageSent?.()
          return Promise.resolve({})
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopPayload = args[2] as OCPP16StopTransactionRequest
          ;(args[3] as { onMessageSent?: () => void }).onMessageSent?.()
          return Promise.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
        }
        return Promise.resolve({})
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler, validateRequestPayload: () => true },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          beginEndMeterValues: true,
          meterSerialNumber: 'SIM-001',
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_16,
          outOfOrderEndMeterValues: false,
          transactionDataMeterValues: true,
        },
      })
      configureSignedStop(station, 100)
      upsertConfigurationKey(
        station,
        OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
        'EveryMeterValue'
      )

      await OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      assert.ok(meterValuesPayload != null)
      assert.ok(stopPayload?.transactionData != null)
      const meterValuesSignedSample = meterValuesPayload.meterValue[0].sampledValue.find(
        sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA
      )
      const stopSignedSample = stopPayload.transactionData
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sampledValue => sampledValue.format === OCPP16MeterValueFormat.SIGNED_DATA)
      assert.ok(meterValuesSignedSample != null)
      assert.ok(stopSignedSample != null)
      assert.notStrictEqual(
        (JSON.parse(meterValuesSignedSample.value) as { publicKey: string }).publicKey,
        ''
      )
      assert.notStrictEqual(
        (JSON.parse(stopSignedSample.value) as { publicKey: string }).publicKey,
        ''
      )
    })

    await it('should reject a connector without a complete active transaction identity', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionStarted = true
      delete connectorStatus.transactionId

      await assert.rejects(
        OCPP16ServiceUtils.stopTransactionOnConnector(station, 1),
        /No active transaction on connector 1/
      )
      assert.strictEqual(requestHandler.mock.callCount(), 0)
    })

    await it('should retain one initiating payload snapshot while Finishing is delayed and the connector is replaced', async () => {
      const statusResponse = Promise.withResolvers<unknown>()
      const statusRequestStarted = Promise.withResolvers<undefined>()
      let endMeterValue: undefined | { meterValue: { sampledValue: { value: string }[] }[] }
      let stopRequest: OCPP16StopTransactionRequest | undefined
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STATUS_NOTIFICATION) {
          statusRequestStarted.resolve(undefined)
          return await statusResponse.promise
        }
        if (args[1] === OCPP16RequestCommand.METER_VALUES) {
          endMeterValue = args[2] as typeof endMeterValue
          return {}
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          stopRequest = args[2] as OCPP16StopTransactionRequest
          return { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler, validateRequestPayload: () => true },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          beginEndMeterValues: true,
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_16,
          outOfOrderEndMeterValues: false,
          transactionDataMeterValues: true,
        },
      })
      setupConnectorWithTransaction(station, 1, {
        energyImport: 1234.4,
        idTag: 'ORIGINAL-TAG',
        transactionId: 100,
      })
      const emitConnectorStatusChanged = mock.method(station, 'emitChargingStationEvent')
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.MeterValues = createMeterValuesTemplate([
        {
          measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: OCPP16MeterValueUnit.WATT_HOUR,
          value: '0',
        },
      ])
      const beginTimestamp = new Date('2026-09-08T10:00:00.000Z')
      connectorStatus.transactionBeginMeterValue = {
        sampledValue: [{ value: '10' }],
        timestamp: beginTimestamp,
      }

      const stop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      await statusRequestStarted.promise
      connectorStatus.transactionId = 200
      connectorStatus.transactionIdTag = 'REPLACEMENT-TAG'
      connectorStatus.transactionBeginMeterValue = {
        sampledValue: [{ value: '9000' }],
        timestamp: new Date('2026-09-08T11:00:00.000Z'),
      }
      connectorStatus.transactionEnergyActiveImportRegisterValue = 9999
      connectorStatus.energyActiveImportRegisterValue = 9999
      connectorStatus.status = OCPP16ChargePointStatus.Charging
      statusResponse.resolve({})
      await stop

      assert.ok(stopRequest != null)
      assert.strictEqual(stopRequest.transactionId, 100)
      assert.strictEqual(stopRequest.idTag, 'ORIGINAL-TAG')
      assert.strictEqual(stopRequest.meterStop, 1234)
      assert.ok(stopRequest.transactionData != null)
      const [transactionBeginMeterValue, transactionEndMeterValue] = stopRequest.transactionData
      assert.strictEqual(transactionBeginMeterValue.sampledValue[0].value, '10')
      assert.strictEqual(transactionEndMeterValue.sampledValue[0].value, '1234')
      assert.strictEqual(
        stopRequest.meterStop,
        Number(transactionEndMeterValue.sampledValue[0].value)
      )
      assert.strictEqual(transactionEndMeterValue.timestamp, stopRequest.timestamp)
      assert.ok(endMeterValue != null)
      assert.strictEqual(endMeterValue.meterValue[0], transactionEndMeterValue)
      assert.strictEqual(connectorStatus.status, OCPP16ChargePointStatus.Charging)
      assert.strictEqual(emitConnectorStatusChanged.mock.callCount(), 0)
    })

    await it('should return a rejection instead of throwing synchronously for malformed strict end-meter setup', async () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          beginEndMeterValues: true,
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_16,
          outOfOrderEndMeterValues: false,
        },
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      let stop: Promise<OCPP16StopTransactionResponse> | undefined
      assert.doesNotThrow(() => {
        stop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      })
      assert.ok(stop != null)
      await assert.rejects(stop, /Missing MeterValues/)
    })

    await it('should reject a replacement transaction while the previous stop remains in flight', async () => {
      const statusResponse = Promise.withResolvers<unknown>()
      const statusRequestStarted = Promise.withResolvers<undefined>()
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === OCPP16RequestCommand.STATUS_NOTIFICATION) {
          statusRequestStarted.resolve(undefined)
          return await statusResponse.promise
        }
        if (args[1] === OCPP16RequestCommand.STOP_TRANSACTION) {
          return { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
        }
        return {}
      })
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })

      const originalStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)
      await statusRequestStarted.promise
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionId = 200
      connectorStatus.status = OCPP16ChargePointStatus.Charging
      const replacementStop = OCPP16ServiceUtils.stopTransactionOnConnector(station, 1)

      assert.notStrictEqual(replacementStop, originalStop)
      await assert.rejects(replacementStop, (error: Error) => {
        assert.ok(error instanceof OCPPError)
        assert.strictEqual(error.code, ErrorType.GENERIC_ERROR)
        assert.match(error.message, /cannot stop replacement transaction 200/)
        return true
      })
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STATUS_NOTIFICATION
        ).length,
        1
      )
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STOP_TRANSACTION
        ).length,
        0
      )

      statusResponse.resolve({})
      await originalStop
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )
    })
  })

  // ─── updateAuthorizationCache ──────────────────────────────────────────

  await describe('updateAuthorizationCache', async () => {
    afterEach(() => {
      OCPPAuthServiceFactory.clearAllInstances()
    })

    await it('should update auth cache with Accepted status', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
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
      const authCache = getTestAuthCache(authService)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null)
      assert.strictEqual(cached.status, AuthResultStatus.ACCEPTED)
    })

    await it('should update auth cache with rejected status', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
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
      const authCache = getTestAuthCache(authService)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null)
      assert.strictEqual(cached.status, AuthResultStatus.BLOCKED)
    })

    await it('should set TTL from expiryDate when in future', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
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
      const authCache = getTestAuthCache(authService)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null, 'Cache entry should exist with future TTL')
      assert.strictEqual(cached.status, AuthResultStatus.ACCEPTED)
    })

    await it('should skip caching when expiryDate is in the past', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
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
      const authCache = getTestAuthCache(authService)
      const cached = authCache.get(TEST_ID_TAG)
      assert.strictEqual(cached, undefined, 'Expired entry must not be cached')
    })

    await it('should cache without TTL when no expiryDate', () => {
      // Arrange
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: {
          chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
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
      const authCache = getTestAuthCache(authService)
      const cached = authCache.get(TEST_ID_TAG)
      assert.ok(cached != null, 'Cache entry should exist without TTL')
      assert.strictEqual(cached.status, AuthResultStatus.ACCEPTED)
    })
  })
})
