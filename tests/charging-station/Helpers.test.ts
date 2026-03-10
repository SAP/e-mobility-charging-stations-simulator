/**
 * @file Tests for Helpers
 * @description Unit tests for charging station helper functions and utilities
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  checkChargingStationState,
  checkConfiguration,
  checkStationInfoConnectorStatus,
  checkTemplate,
  getBootConnectorStatus,
  getChargingStationId,
  getHashId,
  getMaxNumberOfEvses,
  getPhaseRotationValue,
  hasPendingReservation,
  hasPendingReservations,
  hasReservationExpired,
  validateStationInfo,
} from '../../src/charging-station/Helpers.js'
import {
  AvailabilityType,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationTemplate,
  type ConnectorStatus,
  ConnectorStatusEnum,
  OCPPVersion,
  type Reservation,
} from '../../src/types/index.js'
import { logger } from '../../src/utils/Logger.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './ChargingStationTestConstants.js'
import {
  createMockChargingStation,
  createMockChargingStationTemplate,
} from './ChargingStationTestUtils.js'

await describe('Helpers', async () => {
  let chargingStationTemplate: ChargingStationTemplate

  beforeEach(() => {
    chargingStationTemplate = createMockChargingStationTemplate(TEST_CHARGING_STATION_BASE_NAME)
  })

  afterEach(() => {
    standardCleanup()
  })

  // Helper to create test reservations with configurable expiry
  const createTestReservation = (expired = false): Reservation =>
    ({
      connectorId: 1,
      expiryDate: new Date(Date.now() + (expired ? -60000 : 60000)),
      idTag: 'tag1',
      reservationId: 1,
    }) as Reservation

  await it('should return formatted charging station ID with index', () => {
    assert.strictEqual(getChargingStationId(1, chargingStationTemplate),
      `${TEST_CHARGING_STATION_BASE_NAME}-00001`
    )
  })

  await it('should return consistent hash ID for same template and index', () => {
    assert.strictEqual(getHashId(1, chargingStationTemplate),
      'b4b1e8ec4fca79091d99ea9a7ea5901548010e6c0e98be9296f604b9d68734444dfdae73d7d406b6124b42815214d088'
    )
  })

  await it('should throw when stationInfo is missing', () => {
    // Arrange
    // For validation edge cases, we need to manually create invalid states
    // since the factory is designed to create valid configurations
    const { station: stationNoInfo } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
    })
    stationNoInfo.stationInfo = undefined

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationNoInfo)
    }, { message: /Missing charging station information/ })
  })

  await it('should throw when stationInfo is empty object', () => {
    // Arrange
    // For validation edge cases, manually create empty stationInfo
    const { station: stationEmptyInfo } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
    })
    stationEmptyInfo.stationInfo = {} as ChargingStationInfo

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationEmptyInfo)
    }, { message: /Missing charging station information/ })
  })

  await it('should throw when chargingStationId is undefined', () => {
    // Arrange
    const { station: stationMissingId } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: { baseName: TEST_CHARGING_STATION_BASE_NAME, chargingStationId: undefined },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationMissingId)
    }, { message: /Missing chargingStationId in stationInfo properties/ })
  })

  await it('should throw when chargingStationId is empty string', () => {
    // Arrange
    const { station: stationEmptyId } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: { baseName: TEST_CHARGING_STATION_BASE_NAME, chargingStationId: '' },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationEmptyId)
    }, { message: /Missing chargingStationId in stationInfo properties/ })
  })

  await it('should throw when hashId is undefined', () => {
    // Arrange
    const { station: stationMissingHash } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: undefined,
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationMissingHash)
    }, { message: /Missing hashId in stationInfo properties/ })
  })

  await it('should throw when hashId is empty string', () => {
    // Arrange
    const { station: stationEmptyHash } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: '',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationEmptyHash)
    }, { message: /Missing hashId in stationInfo properties/ })
  })

  await it('should throw when templateIndex is undefined', () => {
    // Arrange
    const { station: stationMissingTemplate } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: undefined,
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationMissingTemplate)
    }, { message: /Missing templateIndex in stationInfo properties/ })
  })

  await it('should throw when templateIndex is zero', () => {
    // Arrange
    const { station: stationInvalidTemplate } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: 0,
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationInvalidTemplate)
    }, { message: /Invalid templateIndex value in stationInfo properties/ })
  })

  await it('should throw when templateName is undefined', () => {
    // Arrange
    const { station: stationMissingName } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: 1,
        templateName: undefined,
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationMissingName)
    }, { message: /Missing templateName in stationInfo properties/ })
  })

  await it('should throw when templateName is empty string', () => {
    // Arrange
    const { station: stationEmptyName } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: 1,
        templateName: '',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationEmptyName)
    }, { message: /Missing templateName in stationInfo properties/ })
  })

  await it('should throw when maximumPower is undefined', () => {
    // Arrange
    const { station: stationMissingPower } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumPower: undefined,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationMissingPower)
    }, { message: /Missing maximumPower in stationInfo properties/ })
  })

  await it('should throw when maximumPower is zero', () => {
    // Arrange
    const { station: stationInvalidPower } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumPower: 0,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationInvalidPower)
    }, { message: /Invalid maximumPower value in stationInfo properties/ })
  })

  await it('should throw when maximumAmperage is undefined', () => {
    // Arrange
    const { station: stationMissingAmperage } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: undefined,
        maximumPower: 12000,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationMissingAmperage)
    }, { message: /Missing maximumAmperage in stationInfo properties/ })
  })

  await it('should throw when maximumAmperage is zero', () => {
    // Arrange
    const { station: stationInvalidAmperage } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 0,
        maximumPower: 12000,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationInvalidAmperage)
    }, { message: /Invalid maximumAmperage value in stationInfo properties/ })
  })

  await it('should pass validation with complete valid configuration', () => {
    // Arrange
    const { station: validStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 16,
        maximumPower: 12000,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.doesNotThrow(() => {
      validateStationInfo(validStation)
    })
  })

  await it('should throw for OCPP 2.0 without EVSE configuration', () => {
    // Arrange
    const { station: stationOcpp20 } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 0, // Ensure no EVSEs are created
      evseConfiguration: { evsesCount: 0 },
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 16,
        maximumPower: 12000,
        ocppVersion: OCPPVersion.VERSION_20,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationOcpp20)
    }, { message: /requires at least one EVSE defined in the charging station template\/configuration/ })
  })

  await it('should throw for OCPP 2.0.1 without EVSE configuration', () => {
    // Arrange
    const { station: stationOcpp201 } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 0, // Ensure no EVSEs are created
      evseConfiguration: { evsesCount: 0 },
      stationInfo: {
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 16,
        maximumPower: 12000,
        ocppVersion: OCPPVersion.VERSION_201,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })

    // Act & Assert
    assert.throws(() => {
      validateStationInfo(stationOcpp201)
    }, { message: /requires at least one EVSE defined in the charging station template\/configuration/ })
  })

  await it('should return false and warn when station is not started or starting', t => {
    // Arrange
    const warnMock = t.mock.method(logger, 'warn')
    const { station: stationNotStarted } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      started: false,
      starting: false,
    })

    // Act
    const result = checkChargingStationState(stationNotStarted, 'log prefix |')

    // Assert
    assert.strictEqual(result, false)
    assert.strictEqual(warnMock.mock.calls.length, 1)
  })

  await it('should return true when station is starting', t => {
    // Arrange
    const warnMock = t.mock.method(logger, 'warn')
    const { station: stationStarting } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      started: false,
      starting: true,
    })

    // Act
    const result = checkChargingStationState(stationStarting, 'log prefix |')

    // Assert
    assert.strictEqual(result, true)
    assert.strictEqual(warnMock.mock.calls.length, 0)
  })

  await it('should return true when station is started', t => {
    // Arrange
    const warnMock = t.mock.method(logger, 'warn')
    const { station: stationStarted } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      started: true,
      starting: false,
    })

    // Act
    const result = checkChargingStationState(stationStarted, 'log prefix |')

    // Assert
    assert.strictEqual(result, true)
    assert.strictEqual(warnMock.mock.calls.length, 0)
  })

  await it('should return correct phase rotation value for connector and phase count', () => {
    assert.strictEqual(getPhaseRotationValue(0, 0), '0.RST')
    assert.strictEqual(getPhaseRotationValue(1, 0), '1.NotApplicable')
    assert.strictEqual(getPhaseRotationValue(2, 0), '2.NotApplicable')
    assert.strictEqual(getPhaseRotationValue(0, 1), '0.NotApplicable')
    assert.strictEqual(getPhaseRotationValue(1, 1), '1.NotApplicable')
    assert.strictEqual(getPhaseRotationValue(2, 1), '2.NotApplicable')
    assert.strictEqual(getPhaseRotationValue(0, 2), undefined)
    assert.strictEqual(getPhaseRotationValue(1, 2), undefined)
    assert.strictEqual(getPhaseRotationValue(2, 2), undefined)
    assert.strictEqual(getPhaseRotationValue(0, 3), '0.RST')
    assert.strictEqual(getPhaseRotationValue(1, 3), '1.RST')
    assert.strictEqual(getPhaseRotationValue(2, 3), '2.RST')
  })

  await it('should return -1 for undefined EVSEs and 0 for empty object', () => {
    assert.strictEqual(getMaxNumberOfEvses(undefined), -1)
    assert.strictEqual(getMaxNumberOfEvses({}), 0)
  })

  await it('should throw for undefined or empty template', t => {
    // Arrange
    const warnMock = t.mock.method(logger, 'warn')
    const errorMock = t.mock.method(logger, 'error')

    // Act & Assert
    assert.throws(() => {
      checkTemplate(undefined, 'log prefix |', 'test-template.json')
    }, { message: /Failed to read charging station template file test-template\.json/ })
    assert.strictEqual(errorMock.mock.calls.length, 1)
    assert.throws(() => {
      checkTemplate({} as ChargingStationTemplate, 'log prefix |', 'test-template.json')
    }, { message: /Empty charging station information from template file test-template\.json/ })
    assert.strictEqual(errorMock.mock.calls.length, 2)
    checkTemplate(chargingStationTemplate, 'log prefix |', 'test-template.json')
    assert.strictEqual(warnMock.mock.calls.length, 1)
  })

  await it('should throw for undefined or empty configuration', t => {
    // Arrange
    const errorMock = t.mock.method(logger, 'error')

    // Act & Assert
    assert.throws(() => {
      checkConfiguration(undefined, 'log prefix |', 'configuration.json')
    }, { message: /Failed to read charging station configuration file configuration\.json/ })
    assert.strictEqual(errorMock.mock.calls.length, 1)
    assert.throws(() => {
      checkConfiguration({} as ChargingStationConfiguration, 'log prefix |', 'configuration.json')
    }, { message: /Empty charging station configuration from file configuration\.json/ })
    assert.strictEqual(errorMock.mock.calls.length, 2)
  })

  await it('should warn and clear status when connector has predefined status', t => {
    // Arrange
    const warnMock = t.mock.method(logger, 'warn')
    checkStationInfoConnectorStatus(1, {} as ConnectorStatus, 'log prefix |', 'test-template.json')

    // Act & Assert
    assert.strictEqual(warnMock.mock.calls.length, 0)
    const connectorStatus = {
      status: ConnectorStatusEnum.Available,
    } as ConnectorStatus
    checkStationInfoConnectorStatus(1, connectorStatus, 'log prefix |', 'test-template.json')
    assert.strictEqual(warnMock.mock.calls.length, 1)
    assert.strictEqual(connectorStatus.status, undefined)
  })

  await it('should return Available when no bootStatus is defined', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
    })
    const connectorStatus = {} as ConnectorStatus

    // Act & Assert
    assert.strictEqual(getBootConnectorStatus(chargingStation, 1, connectorStatus),
      ConnectorStatusEnum.Available
    )
  })

  await it('should return bootStatus from template when defined', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
    })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Unavailable,
    } as ConnectorStatus

    // Act & Assert
    assert.strictEqual(getBootConnectorStatus(chargingStation, 1, connectorStatus),
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('should return Unavailable when charging station is inoperative', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorDefaults: { availability: AvailabilityType.Inoperative },
      connectorsCount: 2,
    })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
    } as ConnectorStatus

    // Act & Assert
    assert.strictEqual(getBootConnectorStatus(chargingStation, 1, connectorStatus),
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('should return Unavailable when connector is inoperative', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorDefaults: { availability: AvailabilityType.Inoperative },
      connectorsCount: 2,
    })
    const connectorStatus = {
      availability: AvailabilityType.Inoperative,
      bootStatus: ConnectorStatusEnum.Available,
    } as ConnectorStatus

    // Act & Assert
    assert.strictEqual(getBootConnectorStatus(chargingStation, 1, connectorStatus),
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('should restore previous status when transaction is in progress', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
    })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
      status: ConnectorStatusEnum.Charging,
      transactionStarted: true,
    } as ConnectorStatus

    // Act & Assert
    assert.strictEqual(getBootConnectorStatus(chargingStation, 1, connectorStatus),
      ConnectorStatusEnum.Charging
    )
  })

  await it('should use bootStatus over previous status when no transaction', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
    })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
      status: ConnectorStatusEnum.Charging,
      transactionStarted: false,
    } as ConnectorStatus

    // Act & Assert
    assert.strictEqual(getBootConnectorStatus(chargingStation, 1, connectorStatus),
      ConnectorStatusEnum.Available
    )
  })

  // Tests for reservation helper functions
  await it('should return true when reservation has expired', () => {
    assert.strictEqual(hasReservationExpired(createTestReservation(true)), true)
  })

  await it('should return false when reservation is still valid', () => {
    assert.strictEqual(hasReservationExpired(createTestReservation(false)), false)
  })

  await it('should return false when connector has no reservation', () => {
    const connectorStatus = {} as ConnectorStatus
    assert.strictEqual(hasPendingReservation(connectorStatus), false)
  })

  await it('should return true when connector has valid pending reservation', () => {
    const connectorStatus = { reservation: createTestReservation(false) } as ConnectorStatus
    assert.strictEqual(hasPendingReservation(connectorStatus), true)
  })

  await it('should return false when connector reservation has expired', () => {
    const connectorStatus = { reservation: createTestReservation(true) } as ConnectorStatus
    assert.strictEqual(hasPendingReservation(connectorStatus), false)
  })

  await it('should return false when no reservations exist (connector mode)', () => {
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
    })
    assert.strictEqual(hasPendingReservations(chargingStation), false)
  })

  await it('should return true when pending reservation exists (connector mode)', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
    })
    const connectorStatus = chargingStation.connectors.get(1)
    if (connectorStatus != null) {
      connectorStatus.reservation = createTestReservation(false)
    }

    // Act & Assert
    assert.strictEqual(hasPendingReservations(chargingStation), true)
  })

  await it('should return false when no reservations exist (EVSE mode)', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
    })

    // Act & Assert
    assert.strictEqual(hasPendingReservations(chargingStation), false)
  })

  await it('should return true when pending reservation exists (EVSE mode)', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
    })
    const firstEvse = chargingStation.evses.get(1)
    const firstConnector = firstEvse?.connectors.values().next().value
    if (firstConnector != null) {
      firstConnector.reservation = createTestReservation(false)
    }

    // Act & Assert
    assert.strictEqual(hasPendingReservations(chargingStation), true)
  })

  await it('should return false when only expired reservations exist (EVSE mode)', () => {
    // Arrange
    const { station: chargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
    })
    const firstEvse = chargingStation.evses.get(1)
    const firstConnector = firstEvse?.connectors.values().next().value
    if (firstConnector != null) {
      firstConnector.reservation = createTestReservation(true)
    }

    // Act & Assert
    assert.strictEqual(hasPendingReservations(chargingStation), false)
  })
})
