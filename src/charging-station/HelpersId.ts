// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Serial-number / identity helpers.
 * @description Charging-station identity generation: composed
 *   `chargingStationId`, deterministic `hashId`, serial-number creation
 *   from template prefixes plus a random suffix, and cross-configuration
 *   serial-number propagation. Re-exported from `./Helpers.js` so
 *   callers keep the barrel import path
 *   (`import { getChargingStationId, getHashId, ... } from './Helpers.js'`).
 *
 * Note: no `moduleName` constant is declared here because every helper
 * in this file is pure (no `logger.*` calls); adding an unused constant
 * would violate the codebase's no-dead-code convention. Sibling files
 * that log their own error paths (e.g. `HelpersConfig.ts`) declare it.
 */

import { hash, randomBytes } from 'node:crypto'
import { env } from 'node:process'

import type { ChargingStationInfo, ChargingStationTemplate } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { Constants, isNotEmptyString } from '../utils/index.js'

/**
 * Structural subset of {@link ChargingStationTemplate} carrying only the
 * three fields that shape the composed `chargingStationId`. Kept as a
 * separate type so callers passing user-supplied overrides do not have
 * to satisfy the full template shape. Wrapped in `Readonly` to make
 * `getChargingStationId`'s pure-read contract explicit at the type
 * level.
 */
export type ChargingStationNameTemplate = Readonly<
  Pick<ChargingStationTemplate, 'baseName' | 'fixedName' | 'nameSuffix'>
>

/**
 * Composes the runtime `chargingStationId` from a template's name fields.
 * When `fixedName` is `true` the `baseName` is returned unchanged; otherwise
 * the id is `<baseName>-<CF_INSTANCE_INDEX><4-digit padded index><nameSuffix>`.
 * @param index - Zero-based instance index within the template.
 * @param nameTemplate - Template subset carrying `baseName` / `fixedName` / `nameSuffix`; when `null` / `undefined` the sentinel `"Unknown 'chargingStationId'"` is returned.
 * @returns Composed charging-station id, or the sentinel when `nameTemplate` is missing.
 */
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

/**
 * Deterministic content hash keying a station's persisted configuration
 * on the template shape. The hash covers vendor/model + serial-number
 * prefixes + meter type + the composed `chargingStationId`, so a
 * template change that alters any of these fields yields a distinct
 * `hashId` and therefore a distinct on-disk configuration file.
 * @param index - Zero-based instance index within the template.
 * @param stationTemplate - Template carrying the identity-relevant fields.
 * @param chargingStationIdOverride - Optional override for the composed id (used when a runtime rename must be reflected in the hash).
 * @returns Hex-encoded {@link Constants.DEFAULT_HASH_ALGORITHM} digest.
 */
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

/**
 * Populates `stationInfo`'s serial-number fields from the template's
 * prefixes and a shared random suffix. Only the serial-number channels
 * whose prefix is declared in `stationTemplate` are set on
 * `stationInfo`; the suffix defaults to a random hex string (uppercased
 * unless `params.randomSerialNumberUpperCase === false`), or the empty
 * string when `params.randomSerialNumber === false`.
 * @param stationTemplate - Template declaring which serial-number channels exist.
 * @param stationInfo - Station info to mutate.
 * @param params - Random-suffix knobs (defaults: enabled + uppercase).
 * @param params.randomSerialNumber
 * @param params.randomSerialNumberUpperCase
 */
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

/**
 * Copies serial numbers from an existing station info (typically a
 * pre-existing on-disk configuration) to a fresh station info derived
 * from a template. Each of the three serial-number channels
 * (`chargePointSerialNumber`, `chargeBoxSerialNumber`, `meterSerialNumber`)
 * is copied only when the template declares the corresponding prefix
 * and the source carries a value; otherwise the destination field is
 * cleared.
 * @param stationTemplate - Template driving which serial-number channels are declared.
 * @param stationInfoSrc - Source station info carrying the existing serial numbers.
 * @param stationInfoDst - Destination station info to update in place.
 * @throws {BaseError} When either `stationTemplate` or `stationInfoSrc` is `null` / `undefined`.
 */
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
