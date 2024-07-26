import { describe, it } from 'node:test'

import { expect } from 'expect'

import {
  getChargingStationId,
  getHashId,
  validateStationInfo,
} from '../../src/charging-station/Helpers.js'
import type { ChargingStation } from '../../src/charging-station/index.js'
import { BaseError } from '../../src/exception/index.js'
import {
  type ChargingStationInfo,
  type ChargingStationTemplate,
  type EvseStatus,
  OCPPVersion,
} from '../../src/types/index.js'

await describe('Helpers test suite', async () => {
  const baseName = 'CS-TEST'
  const chargingStationTemplate = {
    baseName,
  } as ChargingStationTemplate
  const chargingStation = {} as ChargingStation

  await it('Verify getChargingStationId()', t => {
    expect(getChargingStationId(1, chargingStationTemplate)).toBe(`${baseName}-00001`)
  })

  await it('Verify getHashId()', t => {
    expect(getHashId(1, chargingStationTemplate)).toBe(
      'b4b1e8ec4fca79091d99ea9a7ea5901548010e6c0e98be9296f604b9d68734444dfdae73d7d406b6124b42815214d088'
    )
  })

  await it('Verify validateStationInfo()', t => {
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
      new BaseError(`${baseName}-00001: Invalid maximumPower value in stationInfo properties`)
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
      new BaseError(`${baseName}-00001: Invalid maximumAmperage value in stationInfo properties`)
    )
    chargingStation.stationInfo.maximumAmperage = 16
    expect(() => {
      validateStationInfo(chargingStation)
    }).not.toThrow()
    chargingStation.evses = new Map<number, EvseStatus>()
    chargingStation.stationInfo.ocppVersion = OCPPVersion.VERSION_201
    expect(() => {
      validateStationInfo(chargingStation)
    }).toThrow(
      new BaseError(
        `${baseName}-00001: OCPP 2.0 or superior requires at least one EVSE defined in the charging station template/configuration`
      )
    )
  })
})
