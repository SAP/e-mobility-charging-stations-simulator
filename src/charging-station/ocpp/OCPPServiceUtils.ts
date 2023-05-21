import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DefinedError, ErrorObject, JSONSchemaType } from 'ajv';

import { OCPP16Constants } from './1.6/OCPP16Constants';
import { OCPP20Constants } from './2.0/OCPP20Constants';
import { OCPPConstants } from './OCPPConstants';
import { type ChargingStation, ChargingStationConfigurationUtils } from '../../charging-station';
import { BaseError } from '../../exception';
import {
  ChargePointErrorCode,
  type ConnectorStatusEnum,
  ErrorType,
  FileType,
  IncomingRequestCommand,
  type JsonObject,
  type JsonType,
  MessageTrigger,
  MessageType,
  MeterValueMeasurand,
  type MeterValuePhase,
  type OCPP16StatusNotificationRequest,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
  RequestCommand,
  type SampledValueTemplate,
  StandardParametersKey,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
} from '../../types';
import { Constants, ErrorUtils, Utils, logger } from '../../utils';

export class OCPPServiceUtils {
  protected constructor() {
    // This is intentional
  }

  public static ajvErrorsToErrorType(errors: ErrorObject[]): ErrorType {
    for (const error of errors as DefinedError[]) {
      switch (error.keyword) {
        case 'type':
          return ErrorType.TYPE_CONSTRAINT_VIOLATION;
        case 'dependencies':
        case 'required':
          return ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION;
        case 'pattern':
        case 'format':
          return ErrorType.PROPERTY_CONSTRAINT_VIOLATION;
      }
    }
    return ErrorType.FORMAT_VIOLATION;
  }

  public static getMessageTypeString(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        return 'request';
      case MessageType.CALL_RESULT_MESSAGE:
        return 'response';
      case MessageType.CALL_ERROR_MESSAGE:
        return 'error';
      default:
        return 'unknown';
    }
  }

  public static isRequestCommandSupported(
    chargingStation: ChargingStation,
    command: RequestCommand
  ): boolean {
    const isRequestCommand = Object.values<RequestCommand>(RequestCommand).includes(command);
    if (
      isRequestCommand === true &&
      !chargingStation.stationInfo?.commandsSupport?.outgoingCommands
    ) {
      return true;
    } else if (
      isRequestCommand === true &&
      chargingStation.stationInfo?.commandsSupport?.outgoingCommands
    ) {
      return chargingStation.stationInfo?.commandsSupport?.outgoingCommands[command] ?? false;
    }
    logger.error(`${chargingStation.logPrefix()} Unknown outgoing OCPP command '${command}'`);
    return false;
  }

  public static isIncomingRequestCommandSupported(
    chargingStation: ChargingStation,
    command: IncomingRequestCommand
  ): boolean {
    const isIncomingRequestCommand =
      Object.values<IncomingRequestCommand>(IncomingRequestCommand).includes(command);
    if (
      isIncomingRequestCommand === true &&
      !chargingStation.stationInfo?.commandsSupport?.incomingCommands
    ) {
      return true;
    } else if (
      isIncomingRequestCommand === true &&
      chargingStation.stationInfo?.commandsSupport?.incomingCommands
    ) {
      return chargingStation.stationInfo?.commandsSupport?.incomingCommands[command] ?? false;
    }
    logger.error(`${chargingStation.logPrefix()} Unknown incoming OCPP command '${command}'`);
    return false;
  }

  public static isMessageTriggerSupported(
    chargingStation: ChargingStation,
    messageTrigger: MessageTrigger
  ): boolean {
    const isMessageTrigger = Object.values(MessageTrigger).includes(messageTrigger);
    if (isMessageTrigger === true && !chargingStation.stationInfo?.messageTriggerSupport) {
      return true;
    } else if (isMessageTrigger === true && chargingStation.stationInfo?.messageTriggerSupport) {
      return chargingStation.stationInfo?.messageTriggerSupport[messageTrigger] ?? false;
    }
    logger.error(
      `${chargingStation.logPrefix()} Unknown incoming OCPP message trigger '${messageTrigger}'`
    );
    return false;
  }

  public static isConnectorIdValid(
    chargingStation: ChargingStation,
    ocppCommand: IncomingRequestCommand,
    connectorId: number
  ): boolean {
    if (connectorId < 0) {
      logger.error(
        `${chargingStation.logPrefix()} ${ocppCommand} incoming request received with invalid connector id ${connectorId}`
      );
      return false;
    }
    return true;
  }

  public static convertDateToISOString<T extends JsonType>(obj: T): void {
    for (const key in obj) {
      if (obj[key] instanceof Date) {
        (obj as JsonObject)[key] = (obj[key] as Date).toISOString();
      } else if (obj[key] !== null && typeof obj[key] === 'object') {
        OCPPServiceUtils.convertDateToISOString<T>(obj[key] as T);
      }
    }
  }

  public static buildStatusNotificationRequest(
    chargingStation: ChargingStation,
    connectorId: number,
    status: ConnectorStatusEnum,
    evseId?: number
  ): StatusNotificationRequest {
    switch (chargingStation.stationInfo.ocppVersion ?? OCPPVersion.VERSION_16) {
      case OCPPVersion.VERSION_16:
        return {
          connectorId,
          status,
          errorCode: ChargePointErrorCode.NO_ERROR,
        } as OCPP16StatusNotificationRequest;
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        return {
          timestamp: new Date(),
          connectorStatus: status,
          connectorId,
          evseId,
        } as OCPP20StatusNotificationRequest;
      default:
        throw new BaseError('Cannot build status notification payload: OCPP version not supported');
    }
  }

  public static startHeartbeatInterval(chargingStation: ChargingStation, interval: number): void {
    if (!chargingStation.heartbeatSetInterval) {
      chargingStation.startHeartbeat();
    } else if (chargingStation.getHeartbeatInterval() !== interval) {
      chargingStation.restartHeartbeat();
    }
  }

  public static async sendAndSetConnectorStatus(
    chargingStation: ChargingStation,
    connectorId: number,
    status: ConnectorStatusEnum,
    evseId?: number
  ) {
    OCPPServiceUtils.checkConnectorStatusTransition(chargingStation, connectorId, status);
    await chargingStation.ocppRequestService.requestHandler<
      StatusNotificationRequest,
      StatusNotificationResponse
    >(
      chargingStation,
      RequestCommand.STATUS_NOTIFICATION,
      OCPPServiceUtils.buildStatusNotificationRequest(chargingStation, connectorId, status, evseId)
    );
    chargingStation.getConnectorStatus(connectorId).status = status;
  }

  protected static checkConnectorStatusTransition(
    chargingStation: ChargingStation,
    connectorId: number,
    status: ConnectorStatusEnum
  ): boolean {
    const fromStatus = chargingStation.getConnectorStatus(connectorId).status;
    let transitionAllowed = false;
    switch (chargingStation.stationInfo.ocppVersion) {
      case OCPPVersion.VERSION_16:
        if (
          (connectorId === 0 &&
            OCPP16Constants.ChargePointStatusChargingStationTransitions.findIndex(
              (transition) => transition.from === fromStatus && transition.to === status
            ) !== -1) ||
          (connectorId > 0 &&
            OCPP16Constants.ChargePointStatusConnectorTransitions.findIndex(
              (transition) => transition.from === fromStatus && transition.to === status
            ) !== -1)
        ) {
          transitionAllowed = true;
        }
        break;
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        if (
          (connectorId === 0 &&
            OCPP20Constants.ChargingStationStatusTransitions.findIndex(
              (transition) => transition.from === fromStatus && transition.to === status
            ) !== -1) ||
          (connectorId > 0 &&
            OCPP20Constants.ConnectorStatusTransitions.findIndex(
              (transition) => transition.from === fromStatus && transition.to === status
            ) !== -1)
        ) {
          transitionAllowed = true;
        }
        break;
      default:
        throw new BaseError(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Cannot check connector status transition: OCPP version ${chargingStation.stationInfo.ocppVersion} not supported`
        );
    }
    if (transitionAllowed === false) {
      logger.warn(
        `${chargingStation.logPrefix()} OCPP ${
          chargingStation.stationInfo.ocppVersion
        } connector id ${connectorId} status transition from '${
          chargingStation.getConnectorStatus(connectorId).status
        }' to '${status}' is not allowed`
      );
    }
    return transitionAllowed;
  }

  protected static parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    ocppVersion: OCPPVersion,
    moduleName?: string,
    methodName?: string
  ): JSONSchemaType<T> {
    const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JSONSchemaType<T>;
    } catch (error) {
      ErrorUtils.handleFileException(
        filePath,
        FileType.JsonSchema,
        error as NodeJS.ErrnoException,
        OCPPServiceUtils.logPrefix(ocppVersion, moduleName, methodName),
        { throwError: false }
      );
    }
  }

  protected static getSampledValueTemplate(
    chargingStation: ChargingStation,
    connectorId: number,
    measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
    phase?: MeterValuePhase
  ): SampledValueTemplate | undefined {
    const onPhaseStr = phase ? `on phase ${phase} ` : '';
    if (OCPPConstants.OCPP_MEASURANDS_SUPPORTED.includes(measurand) === false) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`
      );
      return;
    }
    if (
      measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
      ChargingStationConfigurationUtils.getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData
      )?.value?.includes(measurand) === false
    ) {
      logger.debug(
        `${chargingStation.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId} not found in '${
          StandardParametersKey.MeterValuesSampledData
        }' OCPP parameter`
      );
      return;
    }
    const sampledValueTemplates: SampledValueTemplate[] =
      chargingStation.getConnectorStatus(connectorId)?.MeterValues;
    for (
      let index = 0;
      Utils.isNotEmptyArray(sampledValueTemplates) === true && index < sampledValueTemplates.length;
      index++
    ) {
      if (
        OCPPConstants.OCPP_MEASURANDS_SUPPORTED.includes(
          sampledValueTemplates[index]?.measurand ??
            MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        ) === false
      ) {
        logger.warn(
          `${chargingStation.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`
        );
      } else if (
        phase &&
        sampledValueTemplates[index]?.phase === phase &&
        sampledValueTemplates[index]?.measurand === measurand &&
        ChargingStationConfigurationUtils.getConfigurationKey(
          chargingStation,
          StandardParametersKey.MeterValuesSampledData
        )?.value?.includes(measurand) === true
      ) {
        return sampledValueTemplates[index];
      } else if (
        !phase &&
        !sampledValueTemplates[index].phase &&
        sampledValueTemplates[index]?.measurand === measurand &&
        ChargingStationConfigurationUtils.getConfigurationKey(
          chargingStation,
          StandardParametersKey.MeterValuesSampledData
        )?.value?.includes(measurand) === true
      ) {
        return sampledValueTemplates[index];
      } else if (
        measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
        (!sampledValueTemplates[index].measurand ||
          sampledValueTemplates[index].measurand === measurand)
      ) {
        return sampledValueTemplates[index];
      }
    }
    if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
      const errorMsg = `Missing MeterValues for default measurand '${measurand}' in template on connector id ${connectorId}`;
      logger.error(`${chargingStation.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    logger.debug(
      `${chargingStation.logPrefix()} No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`
    );
  }

  protected static getLimitFromSampledValueTemplateCustomValue(
    value: string,
    limit: number,
    options: { limitationEnabled?: boolean; unitMultiplier?: number } = {
      limitationEnabled: true,
      unitMultiplier: 1,
    }
  ): number {
    options.limitationEnabled = options?.limitationEnabled ?? true;
    options.unitMultiplier = options?.unitMultiplier ?? 1;
    const parsedInt = parseInt(value);
    const numberValue = isNaN(parsedInt) ? Infinity : parsedInt;
    return options?.limitationEnabled
      ? Math.min(numberValue * options.unitMultiplier, limit)
      : numberValue * options.unitMultiplier;
  }

  private static logPrefix = (
    ocppVersion: OCPPVersion,
    moduleName?: string,
    methodName?: string
  ): string => {
    const logMsg =
      Utils.isNotEmptyString(moduleName) && Utils.isNotEmptyString(methodName)
        ? ` OCPP ${ocppVersion} | ${moduleName}.${methodName}:`
        : ` OCPP ${ocppVersion} |`;
    return Utils.logPrefix(logMsg);
  };
}
