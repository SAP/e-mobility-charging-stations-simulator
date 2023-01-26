import type { DefinedError, ErrorObject } from 'ajv';

import BaseError from '../../exception/BaseError';
import type { JsonObject, JsonType } from '../../types/JsonType';
import type { SampledValueTemplate } from '../../types/MeasurandPerPhaseSampledValueTemplates';
import type { OCPP16StatusNotificationRequest } from '../../types/ocpp/1.6/Requests';
import type { OCPP20StatusNotificationRequest } from '../../types/ocpp/2.0/Requests';
import { ChargePointErrorCode } from '../../types/ocpp/ChargePointErrorCode';
import { StandardParametersKey } from '../../types/ocpp/Configuration';
import type { ConnectorStatusEnum } from '../../types/ocpp/ConnectorStatusEnum';
import { ErrorType } from '../../types/ocpp/ErrorType';
import { MessageType } from '../../types/ocpp/MessageType';
import { MeterValueMeasurand, type MeterValuePhase } from '../../types/ocpp/MeterValues';
import { OCPPVersion } from '../../types/ocpp/OCPPVersion';
import {
  IncomingRequestCommand,
  MessageTrigger,
  RequestCommand,
  type StatusNotificationRequest,
} from '../../types/ocpp/Requests';
import Constants from '../../utils/Constants';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import type ChargingStation from '../ChargingStation';
import { ChargingStationConfigurationUtils } from '../ChargingStationConfigurationUtils';

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
        `${chargingStation.logPrefix()} ${ocppCommand} incoming request received with invalid connector Id ${connectorId}`
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
        this.convertDateToISOString<T>(obj[key] as T);
      }
    }
  }

  public static buildStatusNotificationRequest(
    chargingStation: ChargingStation,
    connectorId: number,
    status: ConnectorStatusEnum
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
          evseId: connectorId,
        } as OCPP20StatusNotificationRequest;
      default:
        throw new BaseError('Cannot build status notification payload: OCPP version not supported');
    }
  }

  protected static logPrefix(ocppVersion: OCPPVersion): string {
    return Utils.logPrefix(` OCPP ${ocppVersion} |`);
  }

  protected static getSampledValueTemplate(
    chargingStation: ChargingStation,
    connectorId: number,
    measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
    phase?: MeterValuePhase
  ): SampledValueTemplate | undefined {
    const onPhaseStr = phase ? `on phase ${phase} ` : '';
    if (Constants.SUPPORTED_MEASURANDS.includes(measurand) === false) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId}`
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
        `${chargingStation.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId} not found in '${
          StandardParametersKey.MeterValuesSampledData
        }' OCPP parameter`
      );
      return;
    }
    const sampledValueTemplates: SampledValueTemplate[] =
      chargingStation.getConnectorStatus(connectorId)?.MeterValues;
    for (
      let index = 0;
      Utils.isEmptyArray(sampledValueTemplates) === false && index < sampledValueTemplates.length;
      index++
    ) {
      if (
        Constants.SUPPORTED_MEASURANDS.includes(
          sampledValueTemplates[index]?.measurand ??
            MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        ) === false
      ) {
        logger.warn(
          `${chargingStation.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId}`
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
      const errorMsg = `Missing MeterValues for default measurand '${measurand}' in template on connectorId ${connectorId}`;
      logger.error(`${chargingStation.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    logger.debug(
      `${chargingStation.logPrefix()} No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connectorId ${connectorId}`
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
}
