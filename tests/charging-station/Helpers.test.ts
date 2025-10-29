/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  checkChargingStationState,
  checkConfiguration,
  checkStationInfoConnectorStatus,
  checkTemplate,
  getChargingStationId,
  getHashId,
  getMaxNumberOfEvses,
  getPhaseRotationValue,
  validateStationInfo,
} from '../../src/charging-station/Helpers.js'
import { BaseError } from '../../src/exception/index.js'
import {
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
  const chargingStation = createChargingStation({ baseName })

  await it('Verify getChargingStationId()', () => {
    expect(getChargingStationId(1, chargingStationTemplate)).toBe(`${baseName}-00001`)
  })

  await it('Verify getHashId()', () => {
    expect(getHashId(1, chargingStationTemplate)).toBe(
      'b4b1e8ec4fca79091d99ea9a7ea5901548010e6c0e98be9296f604b9d68734444dfdae73d7d406b6124b42815214d088'
    )
  })

  await it('Verify validateStationInfo()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (chargingStation as any).stationInfo
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError('Missing charging station information'))
    chargingStation.stationInfo = {} as ChargingStationInfo
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError('Missing charging station information'))
    chargingStation.stationInfo.baseName = baseName
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError('Missing chargingStationId in stationInfo properties'))
    chargingStation.stationInfo.chargingStationId = ''
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError('Missing chargingStationId in stationInfo properties'))
    chargingStation.stationInfo.chargingStationId = getChargingStationId(1, chargingStationTemplate)
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError(`${baseName}-00001: Missing hashId in stationInfo properties`))
    chargingStation.stationInfo.hashId = ''
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError(`${baseName}-00001: Missing hashId in stationInfo properties`))
    chargingStation.stationInfo.hashId = getHashId(1, chargingStationTemplate)
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError(`${baseName}-00001: Missing templateIndex in stationInfo properties`))
    chargingStation.stationInfo.templateIndex = 0
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new BaseError(`${baseName}-00001: Invalid templateIndex value in stationInfo properties`)
    )
    chargingStation.stationInfo.templateIndex = 1
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError(`${baseName}-00001: Missing templateName in stationInfo properties`))
    chargingStation.stationInfo.templateName = ''
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError(`${baseName}-00001: Missing templateName in stationInfo properties`))
    chargingStation.stationInfo.templateName = 'test-template.json'
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(new BaseError(`${baseName}-00001: Missing maximumPower in stationInfo properties`))
    chargingStation.stationInfo.maximumPower = 0
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new RangeError(`${baseName}-00001: Invalid maximumPower value in stationInfo properties`)
    )
    chargingStation.stationInfo.maximumPower = 12000
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new BaseError(`${baseName}-00001: Missing maximumAmperage in stationInfo properties`)
    )
    chargingStation.stationInfo.maximumAmperage = 0
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new RangeError(`${baseName}-00001: Invalid maximumAmperage value in stationInfo properties`)
    )
    chargingStation.stationInfo.maximumAmperage = 16
    expect(() => {
      validateStationInfo(chargingStation)
    }).not.toThrow()
    chargingStation.stationInfo.ocppVersion = OCPPVersion.VERSION_20
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new BaseError(
        `${baseName}-00001: OCPP 2.0.x requires at least one EVSE defined in the charging station template/configuration`
      )
    )
    chargingStation.stationInfo.ocppVersion = OCPPVersion.VERSION_201
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new BaseError(
        `${baseName}-00001: OCPP 2.0.x requires at least one EVSE defined in the charging station template/configuration`
      )
    )
  })

  await it('Verify checkChargingStationState()', t => {
    const warnMock = t.mock.method(logger, 'warn')
    expect(checkChargingStationState(chargingStation, 'log prefix |')).toBe(false)
    expect(warnMock.mock.calls.length).toBe(1)
    chargingStation.starting = true
    expect(checkChargingStationState(chargingStation, 'log prefix |')).toBe(true)
    expect(warnMock.mock.calls.length).toBe(1)
    chargingStation.started = true
    expect(checkChargingStationState(chargingStation, 'log prefix |')).toBe(true)
    expect(warnMock.mock.calls.length).toBe(1)
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
})
