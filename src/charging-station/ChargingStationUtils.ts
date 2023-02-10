import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import moment from 'moment';

import type ChargingStation from './ChargingStation';
import BaseError from '../exception/BaseError';
import type { ChargingStationInfo } from '../types/ChargingStationInfo';
import {
  AmpereUnits,
  type ChargingStationTemplate,
  CurrentType,
  Voltage,
} from '../types/ChargingStationTemplate';
import { ChargingProfileKindType, RecurrencyKindType } from '../types/ocpp/1.6/ChargingProfile';
import type { OCPP16BootNotificationRequest } from '../types/ocpp/1.6/Requests';
import { BootReasonEnumType, type OCPP20BootNotificationRequest } from '../types/ocpp/2.0/Requests';
import {
  type ChargingProfile,
  ChargingRateUnitType,
  type ChargingSchedulePeriod,
} from '../types/ocpp/ChargingProfile';
import { OCPPVersion } from '../types/ocpp/OCPPVersion';
import type { BootNotificationRequest } from '../types/ocpp/Requests';
import { WorkerProcessType } from '../types/Worker';
import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import { ACElectricUtils, DCElectricUtils } from '../utils/ElectricUtils';
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
    const idSuffix = stationTemplate?.nameSuffix ?? '';
    const idStr = `000000000${index.toString()}`;
    return stationTemplate?.fixedName
      ? stationTemplate.baseName
      : `${stationTemplate.baseName}-${instanceIndex.toString()}${idStr.substring(
          idStr.length - 4
        )}${idSuffix}`;
  }

  public static getHashId(index: number, stationTemplate: ChargingStationTemplate): string {
    const chargingStationInfo = {
      chargePointModel: stationTemplate.chargePointModel,
      chargePointVendor: stationTemplate.chargePointVendor,
      ...(!Utils.isUndefined(stationTemplate.chargeBoxSerialNumberPrefix) && {
        chargeBoxSerialNumber: stationTemplate.chargeBoxSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationTemplate.chargePointSerialNumberPrefix) && {
        chargePointSerialNumber: stationTemplate.chargePointSerialNumberPrefix,
      }),
      // FIXME?: Should a firmware version change always reference a new configuration file?
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
        `${JSON.stringify(chargingStationInfo)}${ChargingStationUtils.getChargingStationId(
          index,
          stationTemplate
        )}`
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
    if (Utils.isNotEmptyArray(stationTemplate.numberOfConnectors) === true) {
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
    stationInfo: ChargingStationInfo,
    bootReason: BootReasonEnumType = BootReasonEnumType.PowerUp
  ): BootNotificationRequest {
    const ocppVersion = stationInfo.ocppVersion ?? OCPPVersion.VERSION_16;
    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
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
        } as OCPP16BootNotificationRequest;
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        return {
          reason: bootReason,
          chargingStation: {
            model: stationInfo.chargePointModel,
            vendorName: stationInfo.chargePointVendor,
            ...(!Utils.isUndefined(stationInfo.firmwareVersion) && {
              firmwareVersion: stationInfo.firmwareVersion,
            }),
            ...(!Utils.isUndefined(stationInfo.chargeBoxSerialNumber) && {
              serialNumber: stationInfo.chargeBoxSerialNumber,
            }),
            ...((!Utils.isUndefined(stationInfo.iccid) || !Utils.isUndefined(stationInfo.imsi)) && {
              modem: {
                ...(!Utils.isUndefined(stationInfo.iccid) && { iccid: stationInfo.iccid }),
                ...(!Utils.isUndefined(stationInfo.imsi) && { imsi: stationInfo.imsi }),
              },
            }),
          },
        } as OCPP20BootNotificationRequest;
    }
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
          Utils.isNotEmptyString(logMsgToAppend) && `. ${logMsgToAppend}`
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
    stationInfo: ChargingStationInfo,
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
    stationInfo.chargePointSerialNumber = Utils.isNotEmptyString(
      stationTemplate?.chargePointSerialNumberPrefix
    )
      ? `${stationTemplate.chargePointSerialNumberPrefix}${serialNumberSuffix}`
      : undefined;
    stationInfo.chargeBoxSerialNumber = Utils.isNotEmptyString(
      stationTemplate?.chargeBoxSerialNumberPrefix
    )
      ? `${stationTemplate.chargeBoxSerialNumberPrefix}${serialNumberSuffix}`
      : undefined;
    stationInfo.meterSerialNumber = Utils.isNotEmptyString(stationTemplate?.meterSerialNumberPrefix)
      ? `${stationTemplate.meterSerialNumberPrefix}${serialNumberSuffix}`
      : undefined;
  }

  public static propagateSerialNumber(
    stationTemplate: ChargingStationTemplate,
    stationInfoSrc: ChargingStationInfo,
    stationInfoDst: ChargingStationInfo
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

  public static getChargingStationConnectorChargingProfilesPowerLimit(
    chargingStation: ChargingStation,
    connectorId: number
  ): number | undefined {
    let limit: number, matchingChargingProfile: ChargingProfile;
    let chargingProfiles: ChargingProfile[] = [];
    // Get charging profiles for connector and sort by stack level
    chargingProfiles = chargingStation
      .getConnectorStatus(connectorId)
      ?.chargingProfiles?.sort((a, b) => b.stackLevel - a.stackLevel);
    // Get profiles on connector 0
    if (chargingStation.getConnectorStatus(0)?.chargingProfiles) {
      chargingProfiles.push(
        ...chargingStation
          .getConnectorStatus(0)
          .chargingProfiles.sort((a, b) => b.stackLevel - a.stackLevel)
      );
    }
    if (Utils.isNotEmptyArray(chargingProfiles)) {
      const result = ChargingStationUtils.getLimitFromChargingProfiles(
        chargingProfiles,
        chargingStation.logPrefix()
      );
      if (!Utils.isNullOrUndefined(result)) {
        limit = result?.limit;
        matchingChargingProfile = result?.matchingChargingProfile;
        switch (chargingStation.getCurrentOutType()) {
          case CurrentType.AC:
            limit =
              matchingChargingProfile.chargingSchedule.chargingRateUnit ===
              ChargingRateUnitType.WATT
                ? limit
                : ACElectricUtils.powerTotal(
                    chargingStation.getNumberOfPhases(),
                    chargingStation.getVoltageOut(),
                    limit
                  );
            break;
          case CurrentType.DC:
            limit =
              matchingChargingProfile.chargingSchedule.chargingRateUnit ===
              ChargingRateUnitType.WATT
                ? limit
                : DCElectricUtils.power(chargingStation.getVoltageOut(), limit);
        }
        const connectorMaximumPower =
          chargingStation.getMaximumPower() / chargingStation.powerDivider;
        if (limit > connectorMaximumPower) {
          logger.error(
            `${chargingStation.logPrefix()} Charging profile id ${
              matchingChargingProfile.chargingProfileId
            } limit ${limit} is greater than connector id ${connectorId} maximum ${connectorMaximumPower}: %j`,
            result
          );
          limit = connectorMaximumPower;
        }
      }
    }
    return limit;
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

  /**
   * Charging profiles should already be sorted by connectorId and stack level (highest stack level has priority)
   *
   * @param chargingProfiles -
   * @param logPrefix -
   * @returns
   */
  private static getLimitFromChargingProfiles(
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
