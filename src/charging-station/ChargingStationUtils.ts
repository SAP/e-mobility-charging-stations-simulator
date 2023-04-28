import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import moment from 'moment';

import type { ChargingStation } from './internal';
import { BaseError } from '../exception';
import {
  AmpereUnits,
  AvailabilityType,
  type BootNotificationRequest,
  BootReasonEnumType,
  type ChargingProfile,
  ChargingProfileKindType,
  ChargingRateUnitType,
  type ChargingSchedulePeriod,
  type ChargingStationInfo,
  type ChargingStationTemplate,
  ConnectorPhaseRotation,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  type EvseTemplate,
  type OCPP16BootNotificationRequest,
  type OCPP20BootNotificationRequest,
  OCPPVersion,
  RecurrencyKindType,
  Voltage,
} from '../types';
import {
  ACElectricUtils,
  Configuration,
  Constants,
  DCElectricUtils,
  Utils,
  logger,
} from '../utils';
import { WorkerProcessType } from '../worker';

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

  public static checkChargingStation(chargingStation: ChargingStation, logPrefix: string): boolean {
    if (chargingStation.started === false && chargingStation.starting === false) {
      logger.warn(`${logPrefix} charging station is stopped, cannot proceed`);
      return false;
    }
    return true;
  }

  public static getPhaseRotationValue(
    connectorId: number,
    numberOfPhases: number
  ): string | undefined {
    // AC/DC
    if (connectorId === 0 && numberOfPhases === 0) {
      return `${connectorId}.${ConnectorPhaseRotation.RST}`;
    } else if (connectorId > 0 && numberOfPhases === 0) {
      return `${connectorId}.${ConnectorPhaseRotation.NotApplicable}`;
      // AC
    } else if (connectorId > 0 && numberOfPhases === 1) {
      return `${connectorId}.${ConnectorPhaseRotation.NotApplicable}`;
    } else if (connectorId > 0 && numberOfPhases === 3) {
      return `${connectorId}.${ConnectorPhaseRotation.RST}`;
    }
  }

  public static getMaxNumberOfEvses(evses: Record<string, EvseTemplate>): number {
    if (!evses) {
      return -1;
    }
    return Object.keys(evses).length;
  }

  public static getMaxNumberOfConnectors(connectors: Record<string, ConnectorStatus>): number {
    if (!connectors) {
      return -1;
    }
    return Object.keys(connectors).length;
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

  public static getBootConnectorStatus(
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus
  ): ConnectorStatusEnum {
    let connectorBootStatus: ConnectorStatusEnum;
    if (
      !connectorStatus?.status &&
      (chargingStation.isChargingStationAvailable() === false ||
        chargingStation.isConnectorAvailable(connectorId) === false)
    ) {
      connectorBootStatus = ConnectorStatusEnum.Unavailable;
    } else if (!connectorStatus?.status && connectorStatus?.bootStatus) {
      // Set boot status in template at startup
      connectorBootStatus = connectorStatus?.bootStatus;
    } else if (connectorStatus?.status) {
      // Set previous status at startup
      connectorBootStatus = connectorStatus?.status;
    } else {
      // Set default status
      connectorBootStatus = ConnectorStatusEnum.Available;
    }
    return connectorBootStatus;
  }

  public static getConfiguredNumberOfConnectors(stationInfo: ChargingStationInfo): number {
    let configuredMaxConnectors: number;
    if (Utils.isNotEmptyArray(stationInfo.numberOfConnectors) === true) {
      const numberOfConnectors = stationInfo.numberOfConnectors as number[];
      configuredMaxConnectors =
        numberOfConnectors[Math.floor(Utils.secureRandom() * numberOfConnectors.length)];
    } else if (Utils.isUndefined(stationInfo.numberOfConnectors) === false) {
      configuredMaxConnectors = stationInfo.numberOfConnectors as number;
    } else if (stationInfo.Connectors && !stationInfo.Evses) {
      configuredMaxConnectors = stationInfo?.Connectors[0]
        ? ChargingStationUtils.getMaxNumberOfConnectors(stationInfo.Connectors) - 1
        : ChargingStationUtils.getMaxNumberOfConnectors(stationInfo.Connectors);
    } else if (stationInfo.Evses && !stationInfo.Connectors) {
      configuredMaxConnectors = 0;
      for (const evse in stationInfo.Evses) {
        if (evse === '0') {
          continue;
        }
        configuredMaxConnectors += ChargingStationUtils.getMaxNumberOfConnectors(
          stationInfo.Evses[evse].Connectors
        );
      }
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

  public static checkStationInfoConnectorStatus(
    connectorId: number,
    connectorStatus: ConnectorStatus,
    logPrefix: string,
    templateFile: string
  ): void {
    if (!Utils.isNullOrUndefined(connectorStatus?.status)) {
      logger.warn(
        `${logPrefix} Charging station information from template ${templateFile} with connector id ${connectorId} status configuration defined, undefine it`
      );
      delete connectorStatus.status;
    }
  }

  public static buildConnectorsMap(
    connectors: Record<string, ConnectorStatus>,
    logPrefix: string,
    templateFile: string
  ): Map<number, ConnectorStatus> {
    const connectorsMap = new Map<number, ConnectorStatus>();
    if (ChargingStationUtils.getMaxNumberOfConnectors(connectors) > 0) {
      for (const connector in connectors) {
        const connectorStatus = connectors[connector];
        const connectorId = Utils.convertToInt(connector);
        ChargingStationUtils.checkStationInfoConnectorStatus(
          connectorId,
          connectorStatus,
          logPrefix,
          templateFile
        );
        connectorsMap.set(connectorId, Utils.cloneObject<ConnectorStatus>(connectorStatus));
      }
    } else {
      logger.warn(
        `${logPrefix} Charging station information from template ${templateFile} with no connectors, cannot build connectors map`
      );
    }
    return connectorsMap;
  }

  public static initializeConnectorsMapStatus(
    connectors: Map<number, ConnectorStatus>,
    logPrefix: string
  ): void {
    for (const connectorId of connectors.keys()) {
      if (connectorId > 0 && connectors.get(connectorId)?.transactionStarted === true) {
        logger.warn(
          `${logPrefix} Connector id ${connectorId} at initialization has a transaction started with id ${
            connectors.get(connectorId)?.transactionId
          }`
        );
      }
      if (connectorId === 0) {
        connectors.get(connectorId).availability = AvailabilityType.Operative;
        if (Utils.isUndefined(connectors.get(connectorId)?.chargingProfiles)) {
          connectors.get(connectorId).chargingProfiles = [];
        }
      } else if (
        connectorId > 0 &&
        Utils.isNullOrUndefined(connectors.get(connectorId)?.transactionStarted)
      ) {
        ChargingStationUtils.initializeConnectorStatus(connectors.get(connectorId));
      }
    }
  }

  public static resetConnectorStatus(connectorStatus: ConnectorStatus): void {
    connectorStatus.idTagLocalAuthorized = false;
    connectorStatus.idTagAuthorized = false;
    connectorStatus.transactionRemoteStarted = false;
    connectorStatus.transactionStarted = false;
    delete connectorStatus?.localAuthorizeIdTag;
    delete connectorStatus?.authorizeIdTag;
    delete connectorStatus?.transactionId;
    delete connectorStatus?.transactionIdTag;
    connectorStatus.transactionEnergyActiveImportRegisterValue = 0;
    delete connectorStatus?.transactionBeginMeterValue;
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
    return [WorkerProcessType.dynamicPool, WorkerProcessType.staticPool].includes(
      Configuration.getWorker().processType
    );
  }

  public static workerDynamicPoolInUse(): boolean {
    return Configuration.getWorker().processType === WorkerProcessType.dynamicPool;
  }

  public static warnTemplateKeysDeprecation(
    templateFile: string,
    stationTemplate: ChargingStationTemplate,
    logPrefix: string
  ) {
    const templateKeys: { key: string; deprecatedKey: string }[] = [
      { key: 'supervisionUrls', deprecatedKey: 'supervisionUrl' },
      { key: 'idTagsFile', deprecatedKey: 'authorizationFile' },
    ];
    for (const templateKey of templateKeys) {
      ChargingStationUtils.warnDeprecatedTemplateKey(
        stationTemplate,
        templateKey.deprecatedKey,
        templateFile,
        logPrefix,
        `Use '${templateKey.key}' instead`
      );
      ChargingStationUtils.convertDeprecatedTemplateKey(
        stationTemplate,
        templateKey.deprecatedKey,
        templateKey.key
      );
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
    // Get charging profiles for connector and sort by stack level
    const chargingProfiles =
      Utils.cloneObject(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)?.sort(
        (a, b) => b.stackLevel - a.stackLevel
      ) ?? [];
    // Get profiles on connector 0
    if (chargingStation.getConnectorStatus(0)?.chargingProfiles) {
      chargingProfiles.push(
        ...Utils.cloneObject(chargingStation.getConnectorStatus(0).chargingProfiles).sort(
          (a, b) => b.stackLevel - a.stackLevel
        )
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
    const errorMsg = `Unknown ${currentType} currentOutType in template file ${templateFile}, cannot define default voltage out`;
    let defaultVoltageOut: number;
    switch (currentType) {
      case CurrentType.AC:
        defaultVoltageOut = Voltage.VOLTAGE_230;
        break;
      case CurrentType.DC:
        defaultVoltageOut = Voltage.VOLTAGE_400;
        break;
      default:
        logger.error(`${logPrefix} ${errorMsg}`);
        throw new BaseError(errorMsg);
    }
    return defaultVoltageOut;
  }

  public static getIdTagsFile(stationInfo: ChargingStationInfo): string | undefined {
    return (
      stationInfo.idTagsFile &&
      path.join(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../'),
        'assets',
        path.basename(stationInfo.idTagsFile)
      )
    );
  }

  private static initializeConnectorStatus(connectorStatus: ConnectorStatus): void {
    connectorStatus.availability = AvailabilityType.Operative;
    connectorStatus.idTagLocalAuthorized = false;
    connectorStatus.idTagAuthorized = false;
    connectorStatus.transactionRemoteStarted = false;
    connectorStatus.transactionStarted = false;
    connectorStatus.energyActiveImportRegisterValue = 0;
    connectorStatus.transactionEnergyActiveImportRegisterValue = 0;
    if (Utils.isUndefined(connectorStatus.chargingProfiles)) {
      connectorStatus.chargingProfiles = [];
    }
  }

  private static warnDeprecatedTemplateKey(
    template: ChargingStationTemplate,
    key: string,
    templateFile: string,
    logPrefix: string,
    logMsgToAppend = ''
  ): void {
    if (!Utils.isUndefined(template[key])) {
      const logMsg = `Deprecated template key '${key}' usage in file '${templateFile}'${
        Utils.isNotEmptyString(logMsgToAppend) ? `. ${logMsgToAppend}` : ''
      }`;
      logger.warn(`${logPrefix} ${logMsg}`);
      console.warn(chalk.yellow(`${logMsg}`));
    }
  }

  private static convertDeprecatedTemplateKey(
    template: ChargingStationTemplate,
    deprecatedKey: string,
    key: string
  ): void {
    if (!Utils.isUndefined(template[deprecatedKey])) {
      template[key] = template[deprecatedKey] as unknown;
      delete template[deprecatedKey];
    }
  }

  /**
   * Charging profiles should already be sorted by connector id and stack level (highest stack level has priority)
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
    const currentMoment = moment();
    const currentDate = new Date();
    for (const chargingProfile of chargingProfiles) {
      // Set helpers
      const chargingSchedule = chargingProfile.chargingSchedule;
      if (!chargingSchedule?.startSchedule) {
        logger.warn(
          `${logPrefix} ${moduleName}.getLimitFromChargingProfiles: startSchedule is not defined in charging profile id ${chargingProfile.chargingProfileId}`
        );
      }
      // Check type (recurring) and if it is already active
      // Adjust the daily recurring schedule to today
      if (
        chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
        chargingProfile.recurrencyKind === RecurrencyKindType.DAILY &&
        currentMoment.isAfter(chargingSchedule.startSchedule)
      ) {
        if (!(chargingSchedule?.startSchedule instanceof Date)) {
          logger.warn(
            `${logPrefix} ${moduleName}.getLimitFromChargingProfiles: startSchedule is not a Date object in charging profile id ${chargingProfile.chargingProfileId}. Trying to convert it to a Date object`
          );
          chargingSchedule.startSchedule = new Date(chargingSchedule.startSchedule);
        }
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
