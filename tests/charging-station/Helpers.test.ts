/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'node:test'

import { expect } from 'expect'

import {
  checkChargingStationState,
  checkConfiguration,
  checkTemplate,
  getChargingStationId,
  getHashId,
  getMaxNumberOfEvses,
  validateStationInfo,
} from '../../src/charging-station/Helpers.js'
import type { ChargingStation } from '../../src/charging-station/index.js'
import { BaseError } from '../../src/exception/index.js'
import {
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationTemplate,
  type ConnectorStatus,
  type EvseStatus,
  OCPPVersion,
} from '../../src/types/index.js'
import { logger } from '../../src/utils/Logger.js'

await describe('Helpers test suite', async () => {
  const baseName = 'CS-TEST'
  const chargingStationTemplate = {
    baseName,
  } as ChargingStationTemplate
  const chargingStation = {
    started: false,
    logPrefix: () => `${baseName} |`,
    evses: new Map<number, EvseStatus>(),
    connectors: new Map<number, ConnectorStatus>(),
  } as ChargingStation

  await it('Verify getChargingStationId()', () => {
    expect(getChargingStationId(1, chargingStationTemplate)).toBe(`${baseName}-00001`)
  })

  await it('Verify getHashId()', () => {
    expect(getHashId(1, chargingStationTemplate)).toBe(
      'b4b1e8ec4fca79091d99ea9a7ea5901548010e6c0e98be9296f604b9d68734444dfdae73d7d406b6124b42815214d088'
    )
  })

  await it('Verify validateStationInfo()', () => {
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
        `${baseName}-00001: OCPP 2.0 or superior requires at least one EVSE defined in the charging station template/configuration`
      )
    )
    chargingStation.stationInfo.ocppVersion = OCPPVersion.VERSION_201
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new BaseError(
        `${baseName}-00001: OCPP 2.0 or superior requires at least one EVSE defined in the charging station template/configuration`
      )
    )
  })

  await it('Verify checkChargingStationState()', t => {
    t.mock.method(logger, 'warn')
    expect(checkChargingStationState(chargingStation, 'log prefix |')).toBe(false)
    expect(logger.warn.mock.calls.length).toBe(1)
    chargingStation.starting = true
    expect(checkChargingStationState(chargingStation, 'log prefix |')).toBe(true)
    expect(logger.warn.mock.calls.length).toBe(1)
    chargingStation.started = true
    expect(checkChargingStationState(chargingStation, 'log prefix |')).toBe(true)
    expect(logger.warn.mock.calls.length).toBe(1)
  })

  await it('Verify getMaxNumberOfEvses()', () => {
    expect(getMaxNumberOfEvses(undefined)).toBe(-1)
    expect(getMaxNumberOfEvses({})).toBe(0)
  })

  await it('Verify checkTemplate()', t => {
    t.mock.method(logger, 'warn')
    t.mock.method(logger, 'error')
    expect(() => {
      checkTemplate(undefined, 'log prefix |', 'test-template.json')
    }).toThrow(new BaseError('Failed to read charging station template file test-template.json'))
    expect(logger.error.mock.calls.length).toBe(1)
    expect(() => {
      checkTemplate({} as ChargingStationTemplate, 'log prefix |', 'test-template.json')
    }).toThrow(
      new BaseError('Empty charging station information from template file test-template.json')
    )
    expect(logger.error.mock.calls.length).toBe(2)
    checkTemplate(chargingStationTemplate, 'log prefix |', 'test-template.json')
    expect(logger.warn.mock.calls.length).toBe(1)
  })

  await it('Verify checkConfiguration()', t => {
    t.mock.method(logger, 'error')
    expect(() => {
      checkConfiguration(undefined, 'log prefix |', 'configuration.json')
    }).toThrow(
      new BaseError('Failed to read charging station configuration file configuration.json')
    )
    expect(logger.error.mock.calls.length).toBe(1)
    expect(() => {
      checkConfiguration({} as ChargingStationConfiguration, 'log prefix |', 'configuration.json')
    }).toThrow(new BaseError('Empty charging station configuration from file configuration.json'))
    expect(logger.error.mock.calls.length).toBe(2)
  })
})
