// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Configuration and template helpers.
 * @description Charging-station configuration validation and template
 *   normalization: template-file basename derivation, station-info
 *   invariants, template-to-info projection, per-connector default
 *   maximum power derivation, configuration-file presence checks,
 *   station-options overlay, amperage unit divider, default voltage
 *   selection, and asset-path resolution for `idTagsFile` /
 *   `evProfilesFile`. Also exports the pure template-topology helpers
 *   `getMaxNumberOfEvses` / `getMaxNumberOfConnectors` since they are
 *   consumed by `getDefaultConnectorMaximumPower` and belong to the same
 *   configuration/template concern (kept in this file to avoid a
 *   cross-module dependency back into `./Helpers.js`). Re-exported from
 *   `./Helpers.js` so callers keep the barrel import path
 *   (`import { validateStationInfo, ... } from './Helpers.js'`).
 */

import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ChargingStation } from './ChargingStation.js'

import { BaseError } from '../exception/index.js'
import {
  AmpereUnits,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationOptions,
  type ChargingStationTemplate,
  type ConnectorStatus,
  CurrentType,
  type EvseTemplate,
  OCPPVersion,
  PowerUnits,
  Voltage,
} from '../types/index.js'
import { clone, isEmpty, isNotEmptyArray, logger, secureRandom } from '../utils/index.js'

const moduleName = 'HelpersConfig'

/**
 * Derives the template basename (path without extension) relative to the
 * `assets/station-templates` directory. Absolute paths are converted to
 * paths relative to that directory first.
 * @param templateFile - Template file path (absolute or relative).
 * @returns Template basename without extension.
 */
export const buildTemplateName = (templateFile: string): string => {
  if (isAbsolute(templateFile)) {
    templateFile = relative(
      resolve(join(dirname(fileURLToPath(import.meta.url)), 'assets', 'station-templates')),
      templateFile
    )
  }
  const templateFileParsedPath = parse(templateFile)
  return join(templateFileParsedPath.dir, templateFileParsedPath.name)
}

/**
 * Validates the charging-station-info invariants required at startup:
 * `chargingStationId`, `hashId`, `templateIndex`, `templateName`,
 * `maximumPower`, `maximumAmperage`, plus an OCPP-2.0.x-only rule that
 * at least one EVSE be defined.
 * @param chargingStation - The charging station whose `stationInfo` should be checked.
 * @throws {BaseError} When any invariant is missing.
 * @throws {RangeError} When `maximumPower` or `maximumAmperage` is `<= 0`.
 */
export const validateStationInfo = (chargingStation: ChargingStation): void => {
  if (chargingStation.stationInfo == null || isEmpty(chargingStation.stationInfo)) {
    throw new BaseError('Missing charging station information')
  }
  if (
    chargingStation.stationInfo.chargingStationId == null ||
    isEmpty(chargingStation.stationInfo.chargingStationId)
  ) {
    throw new BaseError('Missing chargingStationId in stationInfo properties')
  }
  const chargingStationId = chargingStation.stationInfo.chargingStationId
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    chargingStation.stationInfo.hashId == null ||
    isEmpty(chargingStation.stationInfo.hashId)
  ) {
    throw new BaseError(`${chargingStationId}: Missing hashId in stationInfo properties`)
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (chargingStation.stationInfo.templateIndex == null) {
    throw new BaseError(`${chargingStationId}: Missing templateIndex in stationInfo properties`)
  }
  if (chargingStation.stationInfo.templateIndex <= 0) {
    throw new BaseError(
      `${chargingStationId}: Invalid templateIndex value in stationInfo properties`
    )
  }
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    chargingStation.stationInfo.templateName == null ||
    isEmpty(chargingStation.stationInfo.templateName)
  ) {
    throw new BaseError(`${chargingStationId}: Missing templateName in stationInfo properties`)
  }
  if (chargingStation.stationInfo.maximumPower == null) {
    throw new BaseError(`${chargingStationId}: Missing maximumPower in stationInfo properties`)
  }
  if (chargingStation.stationInfo.maximumPower <= 0) {
    throw new RangeError(
      `${chargingStationId}: Invalid maximumPower value in stationInfo properties`
    )
  }
  if (chargingStation.stationInfo.maximumAmperage == null) {
    throw new BaseError(`${chargingStationId}: Missing maximumAmperage in stationInfo properties`)
  }
  if (chargingStation.stationInfo.maximumAmperage <= 0) {
    throw new RangeError(
      `${chargingStationId}: Invalid maximumAmperage value in stationInfo properties`
    )
  }
  switch (chargingStation.stationInfo.ocppVersion) {
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      if (chargingStation.getNumberOfEvses() === 0) {
        throw new BaseError(
          `${chargingStationId}: OCPP ${chargingStation.stationInfo.ocppVersion} requires at least one EVSE defined in the charging station template/configuration`
        )
      }
  }
}

/**
 * Returns the number of EVSEs defined in a template `Evses` record.
 * @param evses - `Evses` template block.
 * @returns Count; `-1` when the block is `null`/`undefined`, `0` when empty.
 */
export const getMaxNumberOfEvses = (evses: Record<string, EvseTemplate> | undefined): number => {
  if (evses == null) {
    return -1
  }
  return isEmpty(evses) ? 0 : Object.keys(evses).length
}

/**
 * Returns the number of connectors defined in a template `Connectors` record.
 * @param connectors - `Connectors` template block.
 * @returns Count; `-1` when the block is `null`/`undefined`, `0` when empty.
 */
export const getMaxNumberOfConnectors = (
  connectors: Record<string, ConnectorStatus> | undefined
): number => {
  if (connectors == null) {
    return -1
  }
  return isEmpty(connectors) ? 0 : Object.keys(connectors).length
}

/**
 * Derives the default per-connector maximum power from `stationTemplate.power`.
 * When `powerSharedByConnectors` is `true`, the full station power is
 * returned; otherwise the value is divided by the static connector count
 * (excluding connector `0`).
 * @param stationTemplate - Source charging-station template.
 * @returns Per-connector maximum power in W, or `undefined` when `power` is not set or the divisor is `<= 0`.
 */
export const getDefaultConnectorMaximumPower = (
  stationTemplate: ChargingStationTemplate
): number | undefined => {
  let maximumPower: number | undefined
  if (isNotEmptyArray<number>(stationTemplate.power)) {
    const powerArrayRandomIndex = Math.floor(secureRandom() * stationTemplate.power.length)
    maximumPower =
      stationTemplate.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplate.power[powerArrayRandomIndex] * 1000
        : stationTemplate.power[powerArrayRandomIndex]
  } else if (typeof stationTemplate.power === 'number') {
    maximumPower =
      stationTemplate.powerUnit === PowerUnits.KILO_WATT
        ? stationTemplate.power * 1000
        : stationTemplate.power
  }
  if (maximumPower == null) {
    return undefined
  }
  if (stationTemplate.powerSharedByConnectors === true) {
    return maximumPower
  }
  const staticCount =
    stationTemplate.Evses != null
      ? getMaxNumberOfEvses(stationTemplate.Evses) -
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        (stationTemplate.Evses['0'] != null ? 1 : 0)
      : getMaxNumberOfConnectors(stationTemplate.Connectors) -
        (stationTemplate.Connectors?.['0'] != null ? 1 : 0)
  return staticCount > 0 ? maximumPower / staticCount : undefined
}

/**
 * Verifies the on-disk configuration file was parsed into a non-empty object.
 * @param stationConfiguration - Parsed configuration (or `undefined` on read failure).
 * @param logPrefix - Log prefix.
 * @param configurationFile - Path to the configuration file (used in error messages).
 * @throws {BaseError} When the configuration is `null`/`undefined` or empty.
 */
export const checkConfiguration = (
  stationConfiguration: ChargingStationConfiguration | undefined,
  logPrefix: string,
  configurationFile: string
): void => {
  if (stationConfiguration == null) {
    const errorMsg = `Failed to read charging station configuration file ${configurationFile}`
    logger.error(`${logPrefix} ${moduleName}.checkConfiguration: ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
  if (isEmpty(stationConfiguration)) {
    const errorMsg = `Empty charging station configuration from file ${configurationFile}`
    logger.error(`${logPrefix} ${moduleName}.checkConfiguration: ${errorMsg}`)
    throw new BaseError(errorMsg)
  }
}

/**
 * Applies user-supplied station options over the template-derived station-info.
 * Each option is copied only when non-null; `persistentConfiguration` fans
 * out across all three per-domain persistence flags.
 * @param stationInfo - Station-info to mutate.
 * @param options - User-supplied overrides.
 * @returns The same `stationInfo` reference for chaining.
 */
export const setChargingStationOptions = (
  stationInfo: ChargingStationInfo,
  options?: ChargingStationOptions
): ChargingStationInfo => {
  if (options?.supervisionUrls != null) {
    stationInfo.supervisionUrls = options.supervisionUrls
  }
  if (options?.supervisionUser != null) {
    stationInfo.supervisionUser = options.supervisionUser
  }
  if (options?.supervisionPassword != null) {
    stationInfo.supervisionPassword = options.supervisionPassword
  }
  if (options?.persistentConfiguration != null) {
    stationInfo.stationInfoPersistentConfiguration = options.persistentConfiguration
    stationInfo.ocppPersistentConfiguration = options.persistentConfiguration
    stationInfo.automaticTransactionGeneratorPersistentConfiguration =
      options.persistentConfiguration
  }
  if (options?.autoStart != null) {
    stationInfo.autoStart = options.autoStart
  }
  if (options?.autoRegister != null) {
    stationInfo.autoRegister = options.autoRegister
  }
  if (options?.enableStatistics != null) {
    stationInfo.enableStatistics = options.enableStatistics
  }
  if (options?.ocppStrictCompliance != null) {
    stationInfo.ocppStrictCompliance = options.ocppStrictCompliance
  }
  if (options?.stopTransactionsOnStopped != null) {
    stationInfo.stopTransactionsOnStopped = options.stopTransactionsOnStopped
  }
  if (options?.baseName != null) {
    stationInfo.baseName = options.baseName
  }
  if (options?.fixedName != null) {
    stationInfo.fixedName = options.fixedName
  }
  if (options?.nameSuffix != null) {
    stationInfo.nameSuffix = options.nameSuffix
  }
  return stationInfo
}

/**
 * Projects a charging-station template into a station-info by dropping the
 * template-only fields (`power`, `powerUnit`, connector/evse maps, the
 * `Configuration` and `AutomaticTransactionGenerator` sections, and the
 * serial-number prefixes).
 * @param stationTemplate - Source template.
 * @returns Station-info clone with template-only fields removed.
 */
export const stationTemplateToStationInfo = (
  stationTemplate: ChargingStationTemplate
): ChargingStationInfo => {
  stationTemplate = clone(stationTemplate)
  delete stationTemplate.power
  delete stationTemplate.powerUnit
  delete stationTemplate.Connectors
  delete stationTemplate.Evses
  delete stationTemplate.Configuration
  delete stationTemplate.AutomaticTransactionGenerator
  delete stationTemplate.numberOfConnectors
  delete stationTemplate.chargeBoxSerialNumberPrefix
  delete stationTemplate.chargePointSerialNumberPrefix
  delete stationTemplate.meterSerialNumberPrefix
  return stationTemplate as ChargingStationInfo
}

/**
 * Returns the divisor mapping the station-configured amperage unit onto
 * amperes: 1 for `A`, 10 for `dA`, 100 for `cA`, 1000 for `mA`.
 * @param stationInfo - Station-info carrying `amperageLimitationUnit`.
 * @returns Divisor to apply to the raw OCPP-configured amperage limit.
 */
export const getAmperageLimitationUnitDivider = (stationInfo: ChargingStationInfo): number => {
  let unitDivider = 1
  switch (stationInfo.amperageLimitationUnit) {
    case AmpereUnits.CENTI_AMPERE:
      unitDivider = 100
      break
    case AmpereUnits.DECI_AMPERE:
      unitDivider = 10
      break
    case AmpereUnits.MILLI_AMPERE:
      unitDivider = 1000
      break
  }
  return unitDivider
}

/**
 * Returns the default output voltage for the given current type:
 * 230 V for AC, 400 V for DC.
 * @param currentType - Current type from the template.
 * @param logPrefix - Log prefix.
 * @param templateFile - Path to the template file (used in error messages).
 * @throws {BaseError} When `currentType` is neither AC nor DC.
 * @returns Default voltage.
 */
export const getDefaultVoltageOut = (
  currentType: CurrentType,
  logPrefix: string,
  templateFile: string
): Voltage => {
  const errorMsg = `Unknown ${currentType} currentOutType in template file ${templateFile}, cannot define default voltage out`
  let defaultVoltageOut: number
  switch (currentType) {
    case CurrentType.AC:
      defaultVoltageOut = Voltage.VOLTAGE_230
      break
    case CurrentType.DC:
      defaultVoltageOut = Voltage.VOLTAGE_400
      break
    default:
      logger.error(`${logPrefix} ${moduleName}.getDefaultVoltageOut: ${errorMsg}`)
      throw new BaseError(errorMsg)
  }
  return defaultVoltageOut
}

/**
 * Resolves the on-disk path to the RFID id-tags file referenced by
 * `stationInfo.idTagsFile`, rooted at the bundled `assets` directory.
 * @param stationInfo - Station-info carrying `idTagsFile`.
 * @returns Absolute path, or `undefined` when `idTagsFile` is not set.
 */
export const getIdTagsFile = (stationInfo: ChargingStationInfo): string | undefined => {
  return stationInfo.idTagsFile != null
    ? join(dirname(fileURLToPath(import.meta.url)), 'assets', basename(stationInfo.idTagsFile))
    : undefined
}

/**
 * Resolves the on-disk path to the EV profiles file referenced by
 * `stationInfo.evProfilesFile`, rooted at the bundled `assets` directory.
 * @param stationInfo - Station-info carrying `evProfilesFile`.
 * @returns Absolute path, or `undefined` when `evProfilesFile` is not set.
 */
export const getEvProfilesFile = (stationInfo: ChargingStationInfo): string | undefined => {
  return stationInfo.evProfilesFile != null
    ? join(dirname(fileURLToPath(import.meta.url)), 'assets', basename(stationInfo.evProfilesFile))
    : undefined
}
