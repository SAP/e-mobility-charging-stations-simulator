// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Serial-number / identity helpers.
 * @description Charging-station identity generation: composed
 *   `chargingStationId`, deterministic `hashId`, serial-number creation
 *   from template prefixes plus a random suffix, and cross-configuration
 *   serial-number propagation. Re-exported from `./Helpers.js` so
 *   callers keep the barrel import path
 *   (`import { getChargingStationId, getHashId, ... } from './Helpers.js'`).
 */

import { hash, randomBytes } from 'node:crypto'
import { env } from 'node:process'

import type { ChargingStationInfo, ChargingStationTemplate } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { Constants, isNotEmptyString } from '../utils/index.js'

export type ChargingStationNameTemplate = Pick<
  ChargingStationTemplate,
  'baseName' | 'fixedName' | 'nameSuffix'
>

export const getChargingStationId = (
  index: number,
  nameTemplate: ChargingStationNameTemplate | undefined
): string => {
  if (nameTemplate == null) {
    return "Unknown 'chargingStationId'"
  }
  // In case of multiple instances: add instance index to charging station id
  const instanceIndex = env.CF_INSTANCE_INDEX ?? 0
  const idSuffix = nameTemplate.nameSuffix ?? ''
  const idStr = `000000000${index.toString()}`
  return nameTemplate.fixedName === true
    ? nameTemplate.baseName
    : `${nameTemplate.baseName}-${instanceIndex.toString()}${idStr.substring(
        idStr.length - 4
      )}${idSuffix}`
}

export const getHashId = (
  index: number,
  stationTemplate: ChargingStationTemplate,
  chargingStationIdOverride?: string
): string => {
  const chargingStationInfo = {
    chargePointModel: stationTemplate.chargePointModel,
    chargePointVendor: stationTemplate.chargePointVendor,
    ...(stationTemplate.chargeBoxSerialNumberPrefix != null && {
      chargeBoxSerialNumber: stationTemplate.chargeBoxSerialNumberPrefix,
    }),
    ...(stationTemplate.chargePointSerialNumberPrefix != null && {
      chargePointSerialNumber: stationTemplate.chargePointSerialNumberPrefix,
    }),
    ...(stationTemplate.meterSerialNumberPrefix != null && {
      meterSerialNumber: stationTemplate.meterSerialNumberPrefix,
    }),
    ...(stationTemplate.meterType != null && {
      meterType: stationTemplate.meterType,
    }),
  }
  return hash(
    Constants.DEFAULT_HASH_ALGORITHM,
    `${JSON.stringify(chargingStationInfo)}${
      chargingStationIdOverride ?? getChargingStationId(index, stationTemplate)
    }`,
    'hex'
  )
}

export const createSerialNumber = (
  stationTemplate: ChargingStationTemplate,
  stationInfo: ChargingStationInfo,
  params?: {
    randomSerialNumber?: boolean
    randomSerialNumberUpperCase?: boolean
  }
): void => {
  params = {
    ...{ randomSerialNumber: true, randomSerialNumberUpperCase: true },
    ...params,
  }
  const serialNumberSuffix = params.randomSerialNumber
    ? getRandomSerialNumberSuffix({
      upperCase: params.randomSerialNumberUpperCase,
    })
    : ''
  isNotEmptyString(stationTemplate.chargePointSerialNumberPrefix) &&
    (stationInfo.chargePointSerialNumber = `${stationTemplate.chargePointSerialNumberPrefix}${serialNumberSuffix}`)
  isNotEmptyString(stationTemplate.chargeBoxSerialNumberPrefix) &&
    (stationInfo.chargeBoxSerialNumber = `${stationTemplate.chargeBoxSerialNumberPrefix}${serialNumberSuffix}`)
  isNotEmptyString(stationTemplate.meterSerialNumberPrefix) &&
    (stationInfo.meterSerialNumber = `${stationTemplate.meterSerialNumberPrefix}${serialNumberSuffix}`)
}

export const propagateSerialNumber = (
  stationTemplate: ChargingStationTemplate | undefined,
  stationInfoSrc: ChargingStationInfo | undefined,
  stationInfoDst: ChargingStationInfo
): void => {
  if (stationInfoSrc == null || stationTemplate == null) {
    throw new BaseError(
      'Missing charging station template or existing configuration to propagate serial number'
    )
  }
  stationTemplate.chargePointSerialNumberPrefix != null &&
  stationInfoSrc.chargePointSerialNumber != null
    ? (stationInfoDst.chargePointSerialNumber = stationInfoSrc.chargePointSerialNumber)
    : stationInfoDst.chargePointSerialNumber != null &&
      delete stationInfoDst.chargePointSerialNumber
  stationTemplate.chargeBoxSerialNumberPrefix != null &&
  stationInfoSrc.chargeBoxSerialNumber != null
    ? (stationInfoDst.chargeBoxSerialNumber = stationInfoSrc.chargeBoxSerialNumber)
    : stationInfoDst.chargeBoxSerialNumber != null && delete stationInfoDst.chargeBoxSerialNumber
  stationTemplate.meterSerialNumberPrefix != null && stationInfoSrc.meterSerialNumber != null
    ? (stationInfoDst.meterSerialNumber = stationInfoSrc.meterSerialNumber)
    : stationInfoDst.meterSerialNumber != null && delete stationInfoDst.meterSerialNumber
}

const getRandomSerialNumberSuffix = (params?: {
  randomBytesLength?: number
  upperCase?: boolean
}): string => {
  const randomSerialNumberSuffix = randomBytes(params?.randomBytesLength ?? 16).toString('hex')
  if (params?.upperCase) {
    return randomSerialNumberSuffix.toUpperCase()
  }
  return randomSerialNumberSuffix
}
