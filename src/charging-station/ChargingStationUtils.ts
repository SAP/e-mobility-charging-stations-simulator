import { ChargingProfile, ChargingSchedulePeriod } from '../types/ocpp/ChargingProfile';
import { ChargingProfileKindType, RecurrencyKindType } from '../types/ocpp/1.6/ChargingProfile';
import ChargingStationTemplate, { AmpereUnits } from '../types/ChargingStationTemplate';

import { BootNotificationRequest } from '../types/ocpp/Requests';
import ChargingStationInfo from '../types/ChargingStationInfo';
import Configuration from '../utils/Configuration';
import Constants from '../utils/Constants';
import Utils from '../utils/Utils';
import { WebSocketCloseEventStatusString } from '../types/WebSocket';
import { WorkerProcessType } from '../types/Worker';
import crypto from 'crypto';
import logger from '../utils/Logger';
import moment from 'moment';

export class ChargingStationUtils {
  public static getChargingStationId(
    index: number,
    stationTemplate: ChargingStationTemplate
  ): string {
    // In case of multiple instances: add instance index to charging station id
    const instanceIndex = process.env.CF_INSTANCE_INDEX ?? 0;
    const idSuffix = stationTemplate.nameSuffix ?? '';
    const idStr = '000000000' + index.toString();
    return stationTemplate.fixedName
      ? stationTemplate.baseName
      : stationTemplate.baseName +
          '-' +
          instanceIndex.toString() +
          idStr.substring(idStr.length - 4) +
          idSuffix;
  }

  public static getHashId(stationInfo: ChargingStationInfo): string {
    const hashBootNotificationRequest = {
      chargePointModel: stationInfo.chargePointModel,
      chargePointVendor: stationInfo.chargePointVendor,
      ...(!Utils.isUndefined(stationInfo.chargeBoxSerialNumberPrefix) && {
        chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationInfo.chargePointSerialNumberPrefix) && {
        chargePointSerialNumber: stationInfo.chargePointSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationInfo.firmwareVersion) && {
        firmwareVersion: stationInfo.firmwareVersion,
      }),
      ...(!Utils.isUndefined(stationInfo.iccid) && { iccid: stationInfo.iccid }),
      ...(!Utils.isUndefined(stationInfo.imsi) && { imsi: stationInfo.imsi }),
      ...(!Utils.isUndefined(stationInfo.meterSerialNumberPrefix) && {
        meterSerialNumber: stationInfo.meterSerialNumberPrefix,
      }),
      ...(!Utils.isUndefined(stationInfo.meterType) && {
        meterType: stationInfo.meterType,
      }),
    };
    return crypto
      .createHash(Constants.DEFAULT_HASH_ALGORITHM)
      .update(JSON.stringify(hashBootNotificationRequest) + stationInfo.chargingStationId)
      .digest('hex');
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
      Configuration.getWorkerProcess()
    );
  }

  public static workerDynamicPoolInUse(): boolean {
    return Configuration.getWorkerProcess() === WorkerProcessType.DYNAMIC_POOL;
  }

  /**
   * Convert websocket error code to human readable string message
   *
   * @param code websocket error code
   * @returns human readable string message
   */
  public static getWebSocketCloseEventStatusString(code: number): string {
    if (code >= 0 && code <= 999) {
      return '(Unused)';
    } else if (code >= 1016) {
      if (code <= 1999) {
        return '(For WebSocket standard)';
      } else if (code <= 2999) {
        return '(For WebSocket extensions)';
      } else if (code <= 3999) {
        return '(For libraries and frameworks)';
      } else if (code <= 4999) {
        return '(For applications)';
      }
    }
    if (!Utils.isUndefined(WebSocketCloseEventStatusString[code])) {
      return WebSocketCloseEventStatusString[code] as string;
    }
    return '(Unknown)';
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

  public static createStationInfoHash(stationInfo: ChargingStationInfo): ChargingStationInfo {
    if (!Utils.isEmptyObject(stationInfo)) {
      const previousInfoHash = stationInfo?.infoHash ?? '';
      delete stationInfo.infoHash;
      const currentInfoHash = crypto
        .createHash(Constants.DEFAULT_HASH_ALGORITHM)
        .update(JSON.stringify(stationInfo))
        .digest('hex');
      if (
        Utils.isEmptyString(previousInfoHash) ||
        (!Utils.isEmptyString(previousInfoHash) && currentInfoHash !== previousInfoHash)
      ) {
        stationInfo.infoHash = currentInfoHash;
      } else {
        stationInfo.infoHash = previousInfoHash;
      }
    }
    return stationInfo;
  }

  public static createSerialNumber(
    stationInfo: ChargingStationInfo,
    existingStationInfo?: ChargingStationInfo,
    params: { randomSerialNumberUpperCase?: boolean; randomSerialNumber?: boolean } = {
      randomSerialNumberUpperCase: true,
      randomSerialNumber: true,
    }
  ): void {
    params = params ?? {};
    params.randomSerialNumberUpperCase = params?.randomSerialNumberUpperCase ?? true;
    params.randomSerialNumber = params?.randomSerialNumber ?? true;
    if (!Utils.isEmptyObject(existingStationInfo)) {
      existingStationInfo?.chargePointSerialNumber &&
        (stationInfo.chargePointSerialNumber = existingStationInfo.chargePointSerialNumber);
      existingStationInfo?.chargeBoxSerialNumber &&
        (stationInfo.chargeBoxSerialNumber = existingStationInfo.chargeBoxSerialNumber);
      existingStationInfo?.meterSerialNumber &&
        (stationInfo.meterSerialNumber = existingStationInfo.meterSerialNumber);
    } else {
      const serialNumberSuffix = params?.randomSerialNumber
        ? ChargingStationUtils.getRandomSerialNumberSuffix({
            upperCase: params.randomSerialNumberUpperCase,
          })
        : '';
      stationInfo.chargePointSerialNumber =
        stationInfo?.chargePointSerialNumberPrefix &&
        stationInfo.chargePointSerialNumberPrefix + serialNumberSuffix;
      stationInfo.chargeBoxSerialNumber =
        stationInfo?.chargeBoxSerialNumberPrefix &&
        stationInfo.chargeBoxSerialNumberPrefix + serialNumberSuffix;
      stationInfo.meterSerialNumber =
        stationInfo?.meterSerialNumberPrefix &&
        stationInfo.meterSerialNumberPrefix + serialNumberSuffix;
    }
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
            logger.debug(
              `${logPrefix} Matching charging profile found for power limitation: %j`,
              result
            );
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
            logger.debug(
              `${logPrefix} Matching charging profile found for power limitation: %j`,
              result
            );
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
            logger.debug(
              `${logPrefix} Matching charging profile found for power limitation: %j`,
              result
            );
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
