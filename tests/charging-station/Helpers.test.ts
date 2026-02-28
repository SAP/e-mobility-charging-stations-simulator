/**
 * @file Tests for Helpers
 * @description Unit tests for charging station helper functions and utilities
 */

import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

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
import { BaseError } from '../../src/exception/index.js'
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
import {
  createMockChargingStation,
  createMockChargingStationTemplate,
} from './ChargingStationTestUtils.js'

await describe('Helpers test suite', async () => {
  const baseName = 'CS-TEST'
  const chargingStationTemplate = createMockChargingStationTemplate(baseName)

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
    expect(getChargingStationId(1, chargingStationTemplate)).toBe(`${baseName}-00001`)
  })

  await it('should return consistent hash ID for same template and index', () => {
    expect(getHashId(1, chargingStationTemplate)).toBe(
      'b4b1e8ec4fca79091d99ea9a7ea5901548010e6c0e98be9296f604b9d68734444dfdae73d7d406b6124b42815214d088'
    )
  })

  await it('should throw when stationInfo is missing', () => {
    // For validation edge cases, we need to manually create invalid states
    // since the factory is designed to create valid configurations
    const { station: stationNoInfo } = createMockChargingStation({ baseName })
    stationNoInfo.stationInfo = undefined
    expect(() => {
      validateStationInfo(stationNoInfo)
    }).toThrow(new BaseError('Missing charging station information'))
  })

  await it('should throw when stationInfo is empty object', () => {
    // For validation edge cases, manually create empty stationInfo
    const { station: stationEmptyInfo } = createMockChargingStation({ baseName })
    stationEmptyInfo.stationInfo = {} as ChargingStationInfo
    expect(() => {
      validateStationInfo(stationEmptyInfo)
    }).toThrow(new BaseError('Missing charging station information'))
  })

  await it('should throw when chargingStationId is undefined', () => {
    const { station: stationMissingId } = createMockChargingStation({
      baseName,
      stationInfo: { baseName, chargingStationId: undefined },
    })
    expect(() => {
      validateStationInfo(stationMissingId)
    }).toThrow(new BaseError('Missing chargingStationId in stationInfo properties'))
  })

  await it('should throw when chargingStationId is empty string', () => {
    const { station: stationEmptyId } = createMockChargingStation({
      baseName,
      stationInfo: { baseName, chargingStationId: '' },
    })
    expect(() => {
      validateStationInfo(stationEmptyId)
    }).toThrow(new BaseError('Missing chargingStationId in stationInfo properties'))
  })

  await it('should throw when hashId is undefined', () => {
    const { station: stationMissingHash } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: undefined,
      },
    })
    expect(() => {
      validateStationInfo(stationMissingHash)
    }).toThrow(new BaseError(`${baseName}-00001: Missing hashId in stationInfo properties`))
  })

  await it('should throw when hashId is empty string', () => {
    const { station: stationEmptyHash } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: '',
      },
    })
    expect(() => {
      validateStationInfo(stationEmptyHash)
    }).toThrow(new BaseError(`${baseName}-00001: Missing hashId in stationInfo properties`))
  })

  await it('should throw when templateIndex is undefined', () => {
    const { station: stationMissingTemplate } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: undefined,
      },
    })
    expect(() => {
      validateStationInfo(stationMissingTemplate)
    }).toThrow(new BaseError(`${baseName}-00001: Missing templateIndex in stationInfo properties`))
  })

  await it('should throw when templateIndex is zero', () => {
    const { station: stationInvalidTemplate } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: 0,
      },
    })
    expect(() => {
      validateStationInfo(stationInvalidTemplate)
    }).toThrow(
      new BaseError(`${baseName}-00001: Invalid templateIndex value in stationInfo properties`)
    )
  })

  await it('should throw when templateName is undefined', () => {
    const { station: stationMissingName } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: 1,
        templateName: undefined,
      },
    })
    expect(() => {
      validateStationInfo(stationMissingName)
    }).toThrow(new BaseError(`${baseName}-00001: Missing templateName in stationInfo properties`))
  })

  await it('should throw when templateName is empty string', () => {
    const { station: stationEmptyName } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        templateIndex: 1,
        templateName: '',
      },
    })
    expect(() => {
      validateStationInfo(stationEmptyName)
    }).toThrow(new BaseError(`${baseName}-00001: Missing templateName in stationInfo properties`))
  })

  await it('should throw when maximumPower is undefined', () => {
    const { station: stationMissingPower } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumPower: undefined,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(stationMissingPower)
    }).toThrow(new BaseError(`${baseName}-00001: Missing maximumPower in stationInfo properties`))
  })

  await it('should throw when maximumPower is zero', () => {
    const { station: stationInvalidPower } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumPower: 0,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(stationInvalidPower)
    }).toThrow(
      new RangeError(`${baseName}-00001: Invalid maximumPower value in stationInfo properties`)
    )
  })

  await it('should throw when maximumAmperage is undefined', () => {
    const { station: stationMissingAmperage } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: undefined,
        maximumPower: 12000,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(stationMissingAmperage)
    }).toThrow(
      new BaseError(`${baseName}-00001: Missing maximumAmperage in stationInfo properties`)
    )
  })

  await it('should throw when maximumAmperage is zero', () => {
    const { station: stationInvalidAmperage } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 0,
        maximumPower: 12000,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(stationInvalidAmperage)
    }).toThrow(
      new RangeError(`${baseName}-00001: Invalid maximumAmperage value in stationInfo properties`)
    )
  })

  await it('should pass validation with complete valid configuration', () => {
    const { station: validStation } = createMockChargingStation({
      baseName,
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 16,
        maximumPower: 12000,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(validStation)
    }).not.toThrow()
  })

  await it('should throw for OCPP 2.0 without EVSE configuration', () => {
    const { station: stationOcpp20 } = createMockChargingStation({
      baseName,
      connectorsCount: 0, // Ensure no EVSEs are created
      evseConfiguration: { evsesCount: 0 },
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 16,
        maximumPower: 12000,
        ocppVersion: OCPPVersion.VERSION_20,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(stationOcpp20)
    }).toThrow(
      new BaseError(
        `${baseName}-00001: OCPP ${stationOcpp20.stationInfo?.ocppVersion ?? 'unknown'} requires at least one EVSE defined in the charging station template/configuration`
      )
    )
  })

  await it('should throw for OCPP 2.0.1 without EVSE configuration', () => {
    const { station: stationOcpp201 } = createMockChargingStation({
      baseName,
      connectorsCount: 0, // Ensure no EVSEs are created
      evseConfiguration: { evsesCount: 0 },
      stationInfo: {
        baseName,
        chargingStationId: getChargingStationId(1, chargingStationTemplate),
        hashId: getHashId(1, chargingStationTemplate),
        maximumAmperage: 16,
        maximumPower: 12000,
        ocppVersion: OCPPVersion.VERSION_201,
        templateIndex: 1,
        templateName: 'test-template.json',
      },
    })
    expect(() => {
      validateStationInfo(stationOcpp201)
    }).toThrow(
      new BaseError(
        `${baseName}-00001: OCPP ${stationOcpp201.stationInfo?.ocppVersion ?? 'unknown'} requires at least one EVSE defined in the charging station template/configuration`
      )
    )
  })

  await it('should return false and warn when station is not started or starting', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const { station: stationNotStarted } = createMockChargingStation({
      baseName,
      started: false,
      starting: false,
    })
    expect(checkChargingStationState(stationNotStarted, 'log prefix |')).toBe(false)
    expect(warnMock.mock.calls.length).toBe(1)
  })

  await it('should return true when station is starting', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const { station: stationStarting } = createMockChargingStation({
      baseName,
      started: false,
      starting: true,
    })
    expect(checkChargingStationState(stationStarting, 'log prefix |')).toBe(true)
    expect(warnMock.mock.calls.length).toBe(0)
  })

  await it('should return true when station is started', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const { station: stationStarted } = createMockChargingStation({
      baseName,
      started: true,
      starting: false,
    })
    expect(checkChargingStationState(stationStarted, 'log prefix |')).toBe(true)
    expect(warnMock.mock.calls.length).toBe(0)
  })

  await it('should return correct phase rotation value for connector and phase count', () => {
    expect(getPhaseRotationValue(0, 0)).toBe('0.RST')
    expect(getPhaseRotationValue(1, 0)).toBe('1.NotApplicable')
    expect(getPhaseRotationValue(2, 0)).toBe('2.NotApplicable')
    expect(getPhaseRotationValue(0, 1)).toBe('0.NotApplicable')
    expect(getPhaseRotationValue(1, 1)).toBe('1.NotApplicable')
    expect(getPhaseRotationValue(2, 1)).toBe('2.NotApplicable')
    expect(getPhaseRotationValue(0, 2)).toBeUndefined()
    expect(getPhaseRotationValue(1, 2)).toBeUndefined()
    expect(getPhaseRotationValue(2, 2)).toBeUndefined()
    expect(getPhaseRotationValue(0, 3)).toBe('0.RST')
    expect(getPhaseRotationValue(1, 3)).toBe('1.RST')
    expect(getPhaseRotationValue(2, 3)).toBe('2.RST')
  })

  await it('should return -1 for undefined EVSEs and 0 for empty object', () => {
    expect(getMaxNumberOfEvses(undefined)).toBe(-1)
    expect(getMaxNumberOfEvses({})).toBe(0)
  })

  await it('should throw for undefined or empty template', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const errorMock = t.mock.method(logger, 'error')
    expect(() => {
      checkTemplate(undefined, 'log prefix |', 'test-template.json')
    }).toThrow(new BaseError('Failed to read charging station template file test-template.json'))
    expect(errorMock.mock.calls.length).toBe(1)
    expect(() => {
      checkTemplate({} as ChargingStationTemplate, 'log prefix |', 'test-template.json')
    }).toThrow(
      new BaseError('Empty charging station information from template file test-template.json')
    )
    expect(errorMock.mock.calls.length).toBe(2)
    checkTemplate(chargingStationTemplate, 'log prefix |', 'test-template.json')
    expect(warnMock.mock.calls.length).toBe(1)
  })

  await it('should throw for undefined or empty configuration', t => {
    const errorMock = t.mock.method(logger, 'error')
    expect(() => {
      checkConfiguration(undefined, 'log prefix |', 'configuration.json')
    }).toThrow(
      new BaseError('Failed to read charging station configuration file configuration.json')
    )
    expect(errorMock.mock.calls.length).toBe(1)
    expect(() => {
      checkConfiguration({} as ChargingStationConfiguration, 'log prefix |', 'configuration.json')
    }).toThrow(new BaseError('Empty charging station configuration from file configuration.json'))
    expect(errorMock.mock.calls.length).toBe(2)
  })

  await it('should warn and clear status when connector has predefined status', t => {
    const warnMock = t.mock.method(logger, 'warn')
    checkStationInfoConnectorStatus(1, {} as ConnectorStatus, 'log prefix |', 'test-template.json')
    expect(warnMock.mock.calls.length).toBe(0)
    const connectorStatus = {
      status: ConnectorStatusEnum.Available,
    } as ConnectorStatus
    checkStationInfoConnectorStatus(1, connectorStatus, 'log prefix |', 'test-template.json')
    expect(warnMock.mock.calls.length).toBe(1)
    expect(connectorStatus.status).toBeUndefined()
  })

  await it('should return Available when no bootStatus is defined', () => {
    const { station: chargingStation } = createMockChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {} as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Available
    )
  })

  await it('should return bootStatus from template when defined', () => {
    const { station: chargingStation } = createMockChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Unavailable,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('should return Unavailable when charging station is inoperative', () => {
    const { station: chargingStation } = createMockChargingStation({
      baseName,
      connectorDefaults: { availability: AvailabilityType.Inoperative },
      connectorsCount: 2,
    })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('should return Unavailable when connector is inoperative', () => {
    const { station: chargingStation } = createMockChargingStation({
      baseName,
      connectorDefaults: { availability: AvailabilityType.Inoperative },
      connectorsCount: 2,
    })
    const connectorStatus = {
      availability: AvailabilityType.Inoperative,
      bootStatus: ConnectorStatusEnum.Available,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('should restore previous status when transaction is in progress', () => {
    const { station: chargingStation } = createMockChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
      status: ConnectorStatusEnum.Charging,
      transactionStarted: true,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Charging
    )
  })

  await it('should use bootStatus over previous status when no transaction', () => {
    const { station: chargingStation } = createMockChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
      status: ConnectorStatusEnum.Charging,
      transactionStarted: false,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Available
    )
  })

  // Tests for reservation helper functions
  await it('should return true when reservation has expired', () => {
    expect(hasReservationExpired(createTestReservation(true))).toBe(true)
  })

  await it('should return false when reservation is still valid', () => {
    expect(hasReservationExpired(createTestReservation(false))).toBe(false)
  })

  await it('should return false when connector has no reservation', () => {
    const connectorStatus = {} as ConnectorStatus
    expect(hasPendingReservation(connectorStatus)).toBe(false)
  })

  await it('should return true when connector has valid pending reservation', () => {
    const connectorStatus = { reservation: createTestReservation(false) } as ConnectorStatus
    expect(hasPendingReservation(connectorStatus)).toBe(true)
  })

  await it('should return false when connector reservation has expired', () => {
    const connectorStatus = { reservation: createTestReservation(true) } as ConnectorStatus
    expect(hasPendingReservation(connectorStatus)).toBe(false)
  })

  await it('should return false when no reservations exist (connector mode)', () => {
    const { station: chargingStation } = createMockChargingStation({ baseName, connectorsCount: 2 })
    expect(hasPendingReservations(chargingStation)).toBe(false)
  })

  await it('should return true when pending reservation exists (connector mode)', () => {
    const { station: chargingStation } = createMockChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = chargingStation.connectors.get(1)
    if (connectorStatus != null) {
      connectorStatus.reservation = createTestReservation(false)
    }
    expect(hasPendingReservations(chargingStation)).toBe(true)
  })

  await it('should return false when no reservations exist (EVSE mode)', () => {
    const { station: chargingStation } = createMockChargingStation({
      baseName,
      connectorsCount: 2,
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
    })
    expect(hasPendingReservations(chargingStation)).toBe(false)
  })

  await it('should return true when pending reservation exists (EVSE mode)', () => {
    const { station: chargingStation } = createMockChargingStation({
      baseName,
      connectorsCount: 2,
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
    })
    const firstEvse = chargingStation.evses.get(1)
    const firstConnector = firstEvse?.connectors.values().next().value
    if (firstConnector != null) {
      firstConnector.reservation = createTestReservation(false)
    }
    expect(hasPendingReservations(chargingStation)).toBe(true)
  })

  await it('should return false when only expired reservations exist (EVSE mode)', () => {
    const { station: chargingStation } = createMockChargingStation({
      baseName,
      connectorsCount: 2,
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
    })
    const firstEvse = chargingStation.evses.get(1)
    const firstConnector = firstEvse?.connectors.values().next().value
    if (firstConnector != null) {
      firstConnector.reservation = createTestReservation(true)
    }
    expect(hasPendingReservations(chargingStation)).toBe(false)
  })
})
