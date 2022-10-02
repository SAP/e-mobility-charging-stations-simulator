import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import moment from 'moment';

import BaseError from '../exception/BaseError';
import type { ChargingStationInfo } from '../types/ChargingStationInfo';
import {
  AmpereUnits,
  type ChargingStationTemplate,
  CurrentType,
  Voltage,
} from '../types/ChargingStationTemplate';
import { ChargingProfileKindType, RecurrencyKindType } from '../types/ocpp/1.6/ChargingProfile';
import type { ChargingProfile, ChargingSchedulePeriod } from '../types/ocpp/ChargingProfile';
import type { BootNotificationRequest } from '../types/ocpp/Requests';
import { WorkerProcessType } from '../types/Worker';
import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';

const moduleName = 'ChargingStationUtils';

export class ChargingStationUtils {
  private constructor() {
    // This is intentional
  }

  public static getChargingStationId(
    index: number,
    stationTemplate: ChargingStationTemplate
  ): string {
    // In case of multiple instances: add instance index to charging station id
    const instanceIndex = process.env.CF_INSTANCE_INDEX ?? 0;
    const idSuffix = stationTemplate.nameSuffix ?? '';
    const idStr = '000000000' + index.toString();
    return stationTemplate?.fixedName
      ? stationTemplate.baseName
      : stationTemplate.baseName +
          '-' +
          instanceIndex.toString() +
          idStr.substring(idStr.length - 4) +
          idSuffix;
  }

  public static getHashId(index: number, stationTemplate: ChargingStationTemplate): string {
    const hashBootNotificationRequest = {
      chargePointModel: stationTemplate.chargePointModel,
      chargePointVendor: stationTemplate.chargePointVendor,
      ...(!Utils.isUndefined(stationTemplate.chargeBoxSerialNumberPrefix) && {
        chargeBoxSerialNumber: stationTemplate.chargeBoxSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationTemplate.chargePointSerialNumberPrefix) && {
        chargePointSerialNumber: stationTemplate.chargePointSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationTemplate.firmwareVersion) && {
        firmwareVersion: stationTemplate.firmwareVersion,
      }),
      ...(!Utils.isUndefined(stationTemplate.iccid) && { iccid: stationTemplate.iccid }),
      ...(!Utils.isUndefined(stationTemplate.imsi) && { imsi: stationTemplate.imsi }),
      ...(!Utils.isUndefined(stationTemplate.meterSerialNumberPrefix) && {
        meterSerialNumber: stationTemplate.meterSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationTemplate.meterType) && {
        meterType: stationTemplate.meterType,
      }),
    };
    return crypto
      .createHash(Constants.DEFAULT_HASH_ALGORITHM)
      .update(
        JSON.stringify(hashBootNotificationRequest) +
          ChargingStationUtils.getChargingStationId(index, stationTemplate)
      )
      .digest('hex');
  }

  public static getTemplateMaxNumberOfConnectors(stationTemplate: ChargingStationTemplate): number {
    const templateConnectors = stationTemplate?.Connectors;
    if (!templateConnectors) {
      return -1;
    }
    return Object.keys(templateConnectors).length;
  }

  public static checkTemplateMaxConnectors(
    templateMaxConnectors: number,
    templateFile: string,
    logPrefix: string
  ): void {
    if (templateMaxConnectors === 0) {
      logger.warn(
        `${logPrefix} Charging station information from template ${templateFile} with empty connectors configuration`
      );
    } else if (templateMaxConnectors < 0) {
      logger.error(
        `${logPrefix} Charging station information from template ${templateFile} with no connectors configuration defined`
      );
    }
  }

  public static getConfiguredNumberOfConnectors(stationTemplate: ChargingStationTemplate): number {
    let configuredMaxConnectors: number;
    if (Utils.isEmptyArray(stationTemplate.numberOfConnectors) === false) {
      const numberOfConnectors = stationTemplate.numberOfConnectors as number[];
      configuredMaxConnectors =
        numberOfConnectors[Math.floor(Utils.secureRandom() * numberOfConnectors.length)];
    } else if (Utils.isUndefined(stationTemplate.numberOfConnectors) === false) {
      configuredMaxConnectors = stationTemplate.numberOfConnectors as number;
    } else {
      configuredMaxConnectors = stationTemplate?.Connectors[0]
        ? ChargingStationUtils.getTemplateMaxNumberOfConnectors(stationTemplate) - 1
        : ChargingStationUtils.getTemplateMaxNumberOfConnectors(stationTemplate);
    }
    return configuredMaxConnectors;
  }

  public static checkConfiguredMaxConnectors(
    configuredMaxConnectors: number,
    templateFile: string,
    logPrefix: string
  ): void {
    if (configuredMaxConnectors <= 0) {
      logger.warn(
        `${logPrefix} Charging station information from template ${templateFile} with ${configuredMaxConnectors} connectors`
      );
    }
  }

  public static createBootNotificationRequest(
    stationInfo: ChargingStationInfo
  ): BootNotificationRequest {
    return {
      chargePointModel: stationInfo.chargePointModel,
      chargePointVendor: stationInfo.chargePointVendor,
      ...(!Utils.isUndefined(stationInfo.chargeBoxSerialNumber) && {
        chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.chargePointSerialNumber) && {
        chargePointSerialNumber: stationInfo.chargePointSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.firmwareVersion) && {
        firmwareVersion: stationInfo.firmwareVersion,
      }),
      ...(!Utils.isUndefined(stationInfo.iccid) && { iccid: stationInfo.iccid }),
      ...(!Utils.isUndefined(stationInfo.imsi) && { imsi: stationInfo.imsi }),
      ...(!Utils.isUndefined(stationInfo.meterSerialNumber) && {
        meterSerialNumber: stationInfo.meterSerialNumber,
      }),
      ...(!Utils.isUndefined(stationInfo.meterType) && {
        meterType: stationInfo.meterType,
      }),
    };
  }

  public static workerPoolInUse(): boolean {
    return [WorkerProcessType.DYNAMIC_POOL, WorkerProcessType.STATIC_POOL].includes(
      Configuration.getWorker().processType
    );
  }

  public static workerDynamicPoolInUse(): boolean {
    return Configuration.getWorker().processType === WorkerProcessType.DYNAMIC_POOL;
  }

  public static warnDeprecatedTemplateKey(
    template: ChargingStationTemplate,
    key: string,
    templateFile: string,
    logPrefix: string,
    logMsgToAppend = ''
  ): void {
    if (!Utils.isUndefined(template[key])) {
      logger.warn(
        `${logPrefix} Deprecated template key '${key}' usage in file '${templateFile}'${
          logMsgToAppend && '. ' + logMsgToAppend
        }`
      );
    }
  }

  public static convertDeprecatedTemplateKey(
    template: ChargingStationTemplate,
    deprecatedKey: string,
    key: string
  ): void {
    if (!Utils.isUndefined(template[deprecatedKey])) {
      template[key] = template[deprecatedKey] as unknown;
      delete template[deprecatedKey];
    }
  }

  public static stationTemplateToStationInfo(
    stationTemplate: ChargingStationTemplate
  ): ChargingStationInfo {
    stationTemplate = Utils.cloneObject(stationTemplate);
    delete stationTemplate.power;
    delete stationTemplate.powerUnit;
    delete stationTemplate.Configuration;
    delete stationTemplate.AutomaticTransactionGenerator;
    delete stationTemplate.chargeBoxSerialNumberPrefix;
    delete stationTemplate.chargePointSerialNumberPrefix;
    delete stationTemplate.meterSerialNumberPrefix;
    return stationTemplate as unknown as ChargingStationInfo;
  }

  public static createStationInfoHash(stationInfo: ChargingStationInfo): void {
    delete stationInfo.infoHash;
    stationInfo.infoHash = crypto
      .createHash(Constants.DEFAULT_HASH_ALGORITHM)
      .update(JSON.stringify(stationInfo))
      .digest('hex');
  }

  public static createSerialNumber(
    stationTemplate: ChargingStationTemplate,
    stationInfo: ChargingStationInfo = {} as ChargingStationInfo,
    params: {
      randomSerialNumberUpperCase?: boolean;
      randomSerialNumber?: boolean;
    } = {
      randomSerialNumberUpperCase: true,
      randomSerialNumber: true,
    }
  ): void {
    params = params ?? {};
    params.randomSerialNumberUpperCase = params?.randomSerialNumberUpperCase ?? true;
    params.randomSerialNumber = params?.randomSerialNumber ?? true;
    const serialNumberSuffix = params?.randomSerialNumber
      ? ChargingStationUtils.getRandomSerialNumberSuffix({
          upperCase: params.randomSerialNumberUpperCase,
        })
      : '';
    stationInfo.chargePointSerialNumber =
      stationTemplate?.chargePointSerialNumberPrefix &&
      stationTemplate.chargePointSerialNumberPrefix + serialNumberSuffix;
    stationInfo.chargeBoxSerialNumber =
      stationTemplate?.chargeBoxSerialNumberPrefix &&
      stationTemplate.chargeBoxSerialNumberPrefix + serialNumberSuffix;
    stationInfo.meterSerialNumber =
      stationTemplate?.meterSerialNumberPrefix &&
      stationTemplate.meterSerialNumberPrefix + serialNumberSuffix;
  }

  public static propagateSerialNumber(
    stationTemplate: ChargingStationTemplate,
    stationInfoSrc: ChargingStationInfo,
    stationInfoDst: ChargingStationInfo = {} as ChargingStationInfo
  ) {
    if (!stationInfoSrc || !stationTemplate) {
      throw new BaseError(
        'Missing charging station template or existing configuration to propagate serial number'
      );
    }
    stationTemplate?.chargePointSerialNumberPrefix && stationInfoSrc?.chargePointSerialNumber
      ? (stationInfoDst.chargePointSerialNumber = stationInfoSrc.chargePointSerialNumber)
      : stationInfoDst?.chargePointSerialNumber && delete stationInfoDst.chargePointSerialNumber;
    stationTemplate?.chargeBoxSerialNumberPrefix && stationInfoSrc?.chargeBoxSerialNumber
      ? (stationInfoDst.chargeBoxSerialNumber = stationInfoSrc.chargeBoxSerialNumber)
      : stationInfoDst?.chargeBoxSerialNumber && delete stationInfoDst.chargeBoxSerialNumber;
    stationTemplate?.meterSerialNumberPrefix && stationInfoSrc?.meterSerialNumber
      ? (stationInfoDst.meterSerialNumber = stationInfoSrc.meterSerialNumber)
      : stationInfoDst?.meterSerialNumber && delete stationInfoDst.meterSerialNumber;
  }

  public static getAmperageLimitationUnitDivider(stationInfo: ChargingStationInfo): number {
    let unitDivider = 1;
    switch (stationInfo.amperageLimitationUnit) {
      case AmpereUnits.DECI_AMPERE:
        unitDivider = 10;
        break;
      case AmpereUnits.CENTI_AMPERE:
        unitDivider = 100;
        break;
      case AmpereUnits.MILLI_AMPERE:
        unitDivider = 1000;
        break;
    }
    return unitDivider;
  }

  /**
   * Charging profiles should already be sorted by connectorId and stack level (highest stack level has priority)
   *
   * @param {ChargingProfile[]} chargingProfiles
   * @param {string} logPrefix
   * @returns {{ limit, matchingChargingProfile }}
   */
  public static getLimitFromChargingProfiles(
    chargingProfiles: ChargingProfile[],
    logPrefix: string
  ): {
    limit: number;
    matchingChargingProfile: ChargingProfile;
  } | null {
    const debugLogMsg = `${logPrefix} ${moduleName}.getLimitFromChargingProfiles: Matching charging profile found for power limitation: %j`;
    for (const chargingProfile of chargingProfiles) {
      // Set helpers
      const currentMoment = moment();
      const chargingSchedule = chargingProfile.chargingSchedule;
      // Check type (recurring) and if it is already active
      // Adjust the daily recurring schedule to today
      if (
        chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
        chargingProfile.recurrencyKind === RecurrencyKindType.DAILY &&
        currentMoment.isAfter(chargingSchedule.startSchedule)
      ) {
        const currentDate = new Date();
        chargingSchedule.startSchedule = new Date(chargingSchedule.startSchedule);
        chargingSchedule.startSchedule.setFullYear(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate()
        );
        // Check if the start of the schedule is yesterday
        if (moment(chargingSchedule.startSchedule).isAfter(currentMoment)) {
          chargingSchedule.startSchedule.setDate(currentDate.getDate() - 1);
        }
      } else if (moment(chargingSchedule.startSchedule).isAfter(currentMoment)) {
        return null;
      }
      // Check if the charging profile is active
      if (
        moment(chargingSchedule.startSchedule)
          .add(chargingSchedule.duration, 's')
          .isAfter(currentMoment)
      ) {
        let lastButOneSchedule: ChargingSchedulePeriod;
        // Search the right schedule period
        for (const schedulePeriod of chargingSchedule.chargingSchedulePeriod) {
          // Handling of only one period
          if (
            chargingSchedule.chargingSchedulePeriod.length === 1 &&
            schedulePeriod.startPeriod === 0
          ) {
            const result = {
              limit: schedulePeriod.limit,
              matchingChargingProfile: chargingProfile,
            };
            logger.debug(debugLogMsg, result);
            return result;
          }
          // Find the right schedule period
          if (
            moment(chargingSchedule.startSchedule)
              .add(schedulePeriod.startPeriod, 's')
              .isAfter(currentMoment)
          ) {
            // Found the schedule: last but one is the correct one
            const result = {
              limit: lastButOneSchedule.limit,
              matchingChargingProfile: chargingProfile,
            };
            logger.debug(debugLogMsg, result);
            return result;
          }
          // Keep it
          lastButOneSchedule = schedulePeriod;
          // Handle the last schedule period
          if (
            schedulePeriod.startPeriod ===
            chargingSchedule.chargingSchedulePeriod[
              chargingSchedule.chargingSchedulePeriod.length - 1
            ].startPeriod
          ) {
            const result = {
              limit: lastButOneSchedule.limit,
              matchingChargingProfile: chargingProfile,
            };
            logger.debug(debugLogMsg, result);
            return result;
          }
        }
      }
    }
    return null;
  }

  public static getDefaultVoltageOut(
    currentType: CurrentType,
    templateFile: string,
    logPrefix: string
  ): Voltage {
    const errMsg = `Unknown ${currentType} currentOutType in template file ${templateFile}, cannot define default voltage out`;
    let defaultVoltageOut: number;
    switch (currentType) {
      case CurrentType.AC:
        defaultVoltageOut = Voltage.VOLTAGE_230;
        break;
      case CurrentType.DC:
        defaultVoltageOut = Voltage.VOLTAGE_400;
        break;
      default:
        logger.error(`${logPrefix} ${errMsg}`);
        throw new BaseError(errMsg);
    }
    return defaultVoltageOut;
  }

  public static getAuthorizationFile(stationInfo: ChargingStationInfo): string | undefined {
    return (
      stationInfo.authorizationFile &&
      path.join(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
        'assets',
        path.basename(stationInfo.authorizationFile)
      )
    );
  }

  private static getRandomSerialNumberSuffix(params?: {
    randomBytesLength?: number;
    upperCase?: boolean;
  }): string {
    const randomSerialNumberSuffix = crypto
      .randomBytes(params?.randomBytesLength ?? 16)
      .toString('hex');
    if (params?.upperCase) {
      return randomSerialNumberSuffix.toUpperCase();
    }
    return randomSerialNumberSuffix;
  }
}
