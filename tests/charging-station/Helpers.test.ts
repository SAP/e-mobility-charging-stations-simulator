/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

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
} from '../../src/types/index.js'
import { logger } from '../../src/utils/Logger.js'
import { createChargingStation, createChargingStationTemplate } from '../ChargingStationFactory.js'

await describe('Helpers test suite', async () => {
  const baseName = 'CS-TEST'
  const chargingStationTemplate = createChargingStationTemplate(baseName)

  await it('Verify getChargingStationId()', () => {
    expect(getChargingStationId(1, chargingStationTemplate)).toBe(`${baseName}-00001`)
  })

  await it('Verify getHashId()', () => {
    expect(getHashId(1, chargingStationTemplate)).toBe(
      'b4b1e8ec4fca79091d99ea9a7ea5901548010e6c0e98be9296f604b9d68734444dfdae73d7d406b6124b42815214d088'
    )
  })

  await it('Verify validateStationInfo() - Missing stationInfo', () => {
    // For validation edge cases, we need to manually create invalid states
    // since the factory is designed to create valid configurations
    const stationNoInfo = createChargingStation({ baseName })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (stationNoInfo as any).stationInfo
    expect(() => {
      validateStationInfo(stationNoInfo)
    }).toThrow(new BaseError('Missing charging station information'))
  })

  await it('Verify validateStationInfo() - Empty stationInfo', () => {
    // For validation edge cases, manually create empty stationInfo
    const stationEmptyInfo = createChargingStation({ baseName })
    stationEmptyInfo.stationInfo = {} as ChargingStationInfo
    expect(() => {
      validateStationInfo(stationEmptyInfo)
    }).toThrow(new BaseError('Missing charging station information'))
  })

  await it('Verify validateStationInfo() - Missing chargingStationId', () => {
    const stationMissingId = createChargingStation({
      baseName,
      stationInfo: { baseName, chargingStationId: undefined },
    })
    expect(() => {
      validateStationInfo(stationMissingId)
    }).toThrow(new BaseError('Missing chargingStationId in stationInfo properties'))
  })

  await it('Verify validateStationInfo() - Empty chargingStationId', () => {
    const stationEmptyId = createChargingStation({
      baseName,
      stationInfo: { baseName, chargingStationId: '' },
    })
    expect(() => {
      validateStationInfo(stationEmptyId)
    }).toThrow(new BaseError('Missing chargingStationId in stationInfo properties'))
  })

  await it('Verify validateStationInfo() - Missing hashId', () => {
    const stationMissingHash = createChargingStation({
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

  await it('Verify validateStationInfo() - Empty hashId', () => {
    const stationEmptyHash = createChargingStation({
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

  await it('Verify validateStationInfo() - Missing templateIndex', () => {
    const stationMissingTemplate = createChargingStation({
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

  await it('Verify validateStationInfo() - Invalid templateIndex (zero)', () => {
    const stationInvalidTemplate = createChargingStation({
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

  await it('Verify validateStationInfo() - Missing templateName', () => {
    const stationMissingName = createChargingStation({
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

  await it('Verify validateStationInfo() - Empty templateName', () => {
    const stationEmptyName = createChargingStation({
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

  await it('Verify validateStationInfo() - Missing maximumPower', () => {
    const stationMissingPower = createChargingStation({
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

  await it('Verify validateStationInfo() - Invalid maximumPower (zero)', () => {
    const stationInvalidPower = createChargingStation({
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

  await it('Verify validateStationInfo() - Missing maximumAmperage', () => {
    const stationMissingAmperage = createChargingStation({
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

  await it('Verify validateStationInfo() - Invalid maximumAmperage (zero)', () => {
    const stationInvalidAmperage = createChargingStation({
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

  await it('Verify validateStationInfo() - Valid configuration passes', () => {
    const validStation = createChargingStation({
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

  await it('Verify validateStationInfo() - OCPP 2.0 requires EVSE', () => {
    const stationOcpp20 = createChargingStation({
      baseName,
      connectorsCount: 0, // Ensure no EVSEs are created
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

  await it('Verify validateStationInfo() - OCPP 2.0.1 requires EVSE', () => {
    const stationOcpp201 = createChargingStation({
      baseName,
      connectorsCount: 0, // Ensure no EVSEs are created
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

  await it('Verify checkChargingStationState() - Not started or starting', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const stationNotStarted = createChargingStation({ baseName, started: false, starting: false })
    expect(checkChargingStationState(stationNotStarted, 'log prefix |')).toBe(false)
    expect(warnMock.mock.calls.length).toBe(1)
  })

  await it('Verify checkChargingStationState() - Starting returns true', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const stationStarting = createChargingStation({ baseName, started: false, starting: true })
    expect(checkChargingStationState(stationStarting, 'log prefix |')).toBe(true)
    expect(warnMock.mock.calls.length).toBe(0)
  })

  await it('Verify checkChargingStationState() - Started returns true', t => {
    const warnMock = t.mock.method(logger, 'warn')
    const stationStarted = createChargingStation({ baseName, started: true, starting: false })
    expect(checkChargingStationState(stationStarted, 'log prefix |')).toBe(true)
    expect(warnMock.mock.calls.length).toBe(0)
  })

  await it('Verify getPhaseRotationValue()', () => {
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

  await it('Verify getMaxNumberOfEvses()', () => {
    expect(getMaxNumberOfEvses(undefined)).toBe(-1)
    expect(getMaxNumberOfEvses({})).toBe(0)
  })

  await it('Verify checkTemplate()', t => {
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

  await it('Verify checkConfiguration()', t => {
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

  await it('Verify checkStationInfoConnectorStatus()', t => {
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

  await it('Verify getBootConnectorStatus() - default to Available when no bootStatus', () => {
    const chargingStation = createChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {} as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Available
    )
  })

  await it('Verify getBootConnectorStatus() - use bootStatus from template', () => {
    const chargingStation = createChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Unavailable,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Unavailable
    )
  })

  await it('Verify getBootConnectorStatus() - charging station unavailable overrides bootStatus', () => {
    const chargingStation = createChargingStation({
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

  await it('Verify getBootConnectorStatus() - connector unavailable overrides bootStatus', () => {
    const chargingStation = createChargingStation({
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

  await it('Verify getBootConnectorStatus() - transaction in progress restores previous status', () => {
    const chargingStation = createChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
      status: ConnectorStatusEnum.Charging,
      transactionStarted: true,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Charging
    )
  })

  await it('Verify getBootConnectorStatus() - no transaction uses bootStatus over previous status', () => {
    const chargingStation = createChargingStation({ baseName, connectorsCount: 2 })
    const connectorStatus = {
      bootStatus: ConnectorStatusEnum.Available,
      status: ConnectorStatusEnum.Charging,
      transactionStarted: false,
    } as ConnectorStatus
    expect(getBootConnectorStatus(chargingStation, 1, connectorStatus)).toBe(
      ConnectorStatusEnum.Available
    )
  })
})
