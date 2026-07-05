import type { EventEmitter } from 'node:events'

import type { ChargingStation } from './ChargingStation.js'

import {
  type ChargingStationTemplate,
  type ChargingStationWorkerMessageEvents,
  ConnectorPhaseRotation,
  StandardParametersKey,
  type SupportedFeatureProfiles,
} from '../types/index.js'
import { isNotEmptyArray, logger, secureRandom } from '../utils/index.js'
import { getConfigurationKey } from './ConfigurationKeyUtils.js'
import { getMaxNumberOfConnectors } from './HelpersConfig.js'

const moduleName = 'Helpers'

export {
  canProceedChargingProfile,
  getChargingStationChargingProfilesLimit,
  getConnectorChargingProfiles,
  getConnectorChargingProfilesLimit,
  prepareChargingProfileKind,
} from './HelpersChargingProfile.js'
export {
  buildTemplateName,
  checkConfiguration,
  getAmperageLimitationUnitDivider,
  getDefaultConnectorMaximumPower,
  getDefaultVoltageOut,
  getEvProfilesFile,
  getIdTagsFile,
  getMaxNumberOfConnectors,
  getMaxNumberOfEvses,
  setChargingStationOptions,
  stationTemplateToStationInfo,
  validateStationInfo,
} from './HelpersConfig.js'
export {
  buildConnectorsMap,
  checkStationInfoConnectorStatus,
  getBootConnectorStatus,
  initializeConnectorsMapStatus,
  prepareConnectorStatus,
  resetAuthorizeConnectorStatus,
  resetConnectorStatus,
} from './HelpersConnectorStatus.js'
export {
  type ChargingStationNameTemplate,
  createSerialNumber,
  getChargingStationId,
  getHashId,
  propagateSerialNumber,
} from './HelpersId.js'
export {
  hasPendingReservation,
  hasPendingReservations,
  hasReservationExpired,
  removeExpiredReservations,
} from './HelpersReservation.js'

export const checkChargingStationState = (
  chargingStation: ChargingStation,
  logPrefix: string
): boolean => {
  if (!chargingStation.started && !chargingStation.starting) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkChargingStationState: Charging station is stopped, cannot proceed`
    )
    return false
  }
  return true
}

export const getPhaseRotationValue = (
  connectorId: number,
  numberOfPhases: number
): string | undefined => {
  // AC/DC
  if (connectorId === 0 && numberOfPhases === 0) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.RST}`
  } else if (connectorId > 0 && numberOfPhases === 0) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.NotApplicable}`
    // AC
  } else if (connectorId >= 0 && numberOfPhases === 1) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.NotApplicable}`
  } else if (connectorId >= 0 && numberOfPhases === 3) {
    return `${connectorId.toString()}.${ConnectorPhaseRotation.RST}`
  }
  return undefined
}

export const hasFeatureProfile = (
  chargingStation: ChargingStation,
  featureProfile: SupportedFeatureProfiles
): boolean => {
  return !!getConfigurationKey(
    chargingStation,
    StandardParametersKey.SupportedFeatureProfiles
  )?.value?.includes(featureProfile)
}

export const waitChargingStationEvents = async (
  emitter: EventEmitter,
  event: ChargingStationWorkerMessageEvents,
  eventsToWait: number
): Promise<number> => {
  return await new Promise<number>(resolve => {
    let events = 0
    if (eventsToWait === 0) {
      resolve(events)
      return
    }
    const handler = () => {
      ++events
      if (events === eventsToWait) {
        emitter.off(event, handler)
        resolve(events)
      }
    }
    emitter.on(event, handler)
  })
}

export const getConfiguredMaxNumberOfConnectors = (
  stationTemplate: ChargingStationTemplate
): number => {
  const picked = pickConfiguredNumberOfConnectors(stationTemplate.numberOfConnectors)
  if (picked != null) {
    return picked
  }
  let configuredMaxNumberOfConnectors = 0
  if (stationTemplate.Connectors != null && stationTemplate.Evses == null) {
    configuredMaxNumberOfConnectors =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      stationTemplate.Connectors[0] != null
        ? getMaxNumberOfConnectors(stationTemplate.Connectors) - 1
        : getMaxNumberOfConnectors(stationTemplate.Connectors)
  } else if (stationTemplate.Evses != null && stationTemplate.Connectors == null) {
    for (const [evseId, evseTemplate] of Object.entries(stationTemplate.Evses)) {
      if (evseId === '0') continue
      configuredMaxNumberOfConnectors += getMaxNumberOfConnectors(evseTemplate.Connectors)
    }
  }
  return configuredMaxNumberOfConnectors
}

/**
 * Worst-case upper bound on the configured connector count from the
 * `numberOfConnectors` template field. Used at validation time to decide
 * whether `randomConnectors` must be auto-enabled (i.e. whether *any*
 * runtime random pick could exceed the connector definitions).
 * @param numberOfConnectors - Template `numberOfConnectors` field value
 * @returns Upper bound, or `undefined` when the field is not set
 */
export const getMaxConfiguredNumberOfConnectors = (
  numberOfConnectors: number | readonly number[] | undefined
): number | undefined => {
  if (isNotEmptyArray<number>(numberOfConnectors)) {
    return Math.max(...numberOfConnectors)
  }
  if (typeof numberOfConnectors === 'number') {
    return numberOfConnectors
  }
  return undefined
}

/**
 * Random pick from the `numberOfConnectors` template field. Used at
 * runtime to materialize the actual connector count for one station
 * instance.
 * @param numberOfConnectors - Template `numberOfConnectors` field value
 * @returns Picked count, or `undefined` when the field is not set
 */
export const pickConfiguredNumberOfConnectors = (
  numberOfConnectors: number | readonly number[] | undefined
): number | undefined => {
  if (isNotEmptyArray<number>(numberOfConnectors)) {
    return numberOfConnectors[Math.floor(secureRandom() * numberOfConnectors.length)]
  }
  if (typeof numberOfConnectors === 'number') {
    return numberOfConnectors
  }
  return undefined
}
