import BaseError from '../exception/BaseError';
import type OCPPError from '../exception/OCPPError';
import { StandardParametersKey } from '../types/ocpp/Configuration';
import {
  type BootNotificationRequest,
  type DataTransferRequest,
  type HeartbeatRequest,
  type MeterValuesRequest,
  RequestCommand,
  type StatusNotificationRequest,
} from '../types/ocpp/Requests';
import {
  type BootNotificationResponse,
  type DataTransferResponse,
  DataTransferStatus,
  type HeartbeatResponse,
  type MeterValuesResponse,
  RegistrationStatus,
  type StatusNotificationResponse,
} from '../types/ocpp/Responses';
import {
  AuthorizationStatus,
  type AuthorizeRequest,
  type AuthorizeResponse,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type StopTransactionRequest,
  type StopTransactionResponse,
} from '../types/ocpp/Transaction';
import { ResponseStatus } from '../types/UIProtocol';
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequest,
  type BroadcastChannelRequestPayload,
  type BroadcastChannelResponsePayload,
  type MessageEvent,
} from '../types/WorkerBroadcastChannel';
import Constants from '../utils/Constants';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';
import type ChargingStation from './ChargingStation';
import { ChargingStationConfigurationUtils } from './ChargingStationConfigurationUtils';
import { OCPP16ServiceUtils } from './ocpp/1.6/OCPP16ServiceUtils';
import WorkerBroadcastChannel from './WorkerBroadcastChannel';

const moduleName = 'ChargingStationWorkerBroadcastChannel';

type CommandResponse =
  | StartTransactionResponse
  | StopTransactionResponse
  | AuthorizeResponse
  | BootNotificationResponse
  | StatusNotificationResponse
  | HeartbeatResponse
  | MeterValuesResponse
  | DataTransferResponse;

type CommandHandler = (
  requestPayload?: BroadcastChannelRequestPayload
) => Promise<CommandResponse | void> | void;

export default class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly commandHandlers: Map<BroadcastChannelProcedureName, CommandHandler>;
  private readonly chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    super();
    this.commandHandlers = new Map<BroadcastChannelProcedureName, CommandHandler>([
      [BroadcastChannelProcedureName.START_CHARGING_STATION, () => this.chargingStation.start()],
      [
        BroadcastChannelProcedureName.STOP_CHARGING_STATION,
        async () => this.chargingStation.stop(),
      ],
      [
        BroadcastChannelProcedureName.OPEN_CONNECTION,
        () => this.chargingStation.openWSConnection(),
      ],
      [
        BroadcastChannelProcedureName.CLOSE_CONNECTION,
        () => this.chargingStation.closeWSConnection(),
      ],
      [
        BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
        (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.startAutomaticTransactionGenerator(requestPayload.connectorIds),
      ],
      [
        BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
        (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.stopAutomaticTransactionGenerator(requestPayload.connectorIds),
      ],
      [
        BroadcastChannelProcedureName.START_TRANSACTION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            StartTransactionRequest,
            StartTransactionResponse
          >(this.chargingStation, RequestCommand.START_TRANSACTION, requestPayload),
      ],
      [
        BroadcastChannelProcedureName.STOP_TRANSACTION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            StopTransactionRequest,
            StartTransactionResponse
          >(this.chargingStation, RequestCommand.STOP_TRANSACTION, {
            meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
              requestPayload.transactionId,
              true
            ),
            ...requestPayload,
          }),
      ],
      [
        BroadcastChannelProcedureName.AUTHORIZE,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            AuthorizeRequest,
            AuthorizeResponse
          >(this.chargingStation, RequestCommand.AUTHORIZE, requestPayload),
      ],
      [
        BroadcastChannelProcedureName.BOOT_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          this.chargingStation.bootNotificationResponse =
            await this.chargingStation.ocppRequestService.requestHandler<
              BootNotificationRequest,
              BootNotificationResponse
            >(
              this.chargingStation,
              RequestCommand.BOOT_NOTIFICATION,
              {
                ...this.chargingStation.bootNotificationRequest,
                ...requestPayload,
              },
              {
                skipBufferingOnError: true,
              }
            );
          return this.chargingStation.bootNotificationResponse;
        },
      ],
      [
        BroadcastChannelProcedureName.STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            StatusNotificationRequest,
            StatusNotificationResponse
          >(this.chargingStation, RequestCommand.STATUS_NOTIFICATION, requestPayload),
      ],
      [
        BroadcastChannelProcedureName.HEARTBEAT,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            HeartbeatRequest,
            HeartbeatResponse
          >(this.chargingStation, RequestCommand.HEARTBEAT, requestPayload),
      ],
      [
        BroadcastChannelProcedureName.METER_VALUES,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          const configuredMeterValueSampleInterval =
            ChargingStationConfigurationUtils.getConfigurationKey(
              chargingStation,
              StandardParametersKey.MeterValueSampleInterval
            );
          return this.chargingStation.ocppRequestService.requestHandler<
            MeterValuesRequest,
            MeterValuesResponse
          >(this.chargingStation, RequestCommand.METER_VALUES, {
            meterValue: [
              OCPP16ServiceUtils.buildMeterValue(
                this.chargingStation,
                requestPayload.connectorId,
                this.chargingStation.getConnectorStatus(requestPayload.connectorId)?.transactionId,
                configuredMeterValueSampleInterval
                  ? Utils.convertToInt(configuredMeterValueSampleInterval.value) * 1000
                  : Constants.DEFAULT_METER_VALUES_INTERVAL
              ),
            ],
            ...requestPayload,
          });
        },
      ],
      [
        BroadcastChannelProcedureName.DATA_TRANSFER,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            DataTransferRequest,
            DataTransferResponse
          >(this.chargingStation, RequestCommand.DATA_TRANSFER, requestPayload),
      ],
    ]);
    this.chargingStation = chargingStation;
    this.onmessage = this.requestHandler.bind(this) as (message: MessageEvent) => void;
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: MessageEvent) => void;
  }

  private async requestHandler(messageEvent: MessageEvent): Promise<void> {
    const validatedMessageEvent = this.validateMessageEvent(messageEvent);
    if (validatedMessageEvent === false) {
      return;
    }
    if (this.isResponse(validatedMessageEvent.data) === true) {
      return;
    }
    const [uuid, command, requestPayload] = validatedMessageEvent.data as BroadcastChannelRequest;
    if (
      requestPayload?.hashIds !== undefined &&
      requestPayload?.hashIds?.includes(this.chargingStation.stationInfo.hashId) === false
    ) {
      return;
    }
    if (requestPayload?.hashId !== undefined) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'hashId' field usage in PDU is deprecated, use 'hashIds' instead`
      );
      return;
    }
    let responsePayload: BroadcastChannelResponsePayload;
    let commandResponse: CommandResponse | void;
    try {
      commandResponse = await this.commandHandler(command, requestPayload);
      if (commandResponse === undefined || commandResponse === null) {
        responsePayload = {
          hashId: this.chargingStation.stationInfo.hashId,
          status: ResponseStatus.SUCCESS,
        };
      } else {
        responsePayload = this.commandResponseToResponsePayload(
          command,
          requestPayload,
          commandResponse as CommandResponse
        );
      }
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: Handle request error:`,
        error
      );
      responsePayload = {
        hashId: this.chargingStation.stationInfo.hashId,
        status: ResponseStatus.FAILURE,
        command,
        requestPayload,
        commandResponse: commandResponse as CommandResponse,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        errorDetails: (error as OCPPError).details,
      };
    } finally {
      this.sendResponse([uuid, responsePayload]);
    }
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.messageErrorHandler: Error at handling message:`,
      messageEvent
    );
  }

  private async commandHandler(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
  ): Promise<CommandResponse | void> {
    if (this.commandHandlers.has(command) === true) {
      this.cleanRequestPayload(command, requestPayload);
      return this.commandHandlers.get(command)(requestPayload);
    }
    throw new BaseError(`Unknown worker broadcast channel command: ${command}`);
  }

  private cleanRequestPayload(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
  ): void {
    delete requestPayload.hashId;
    delete requestPayload.hashIds;
    [
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
    ].includes(command) === false && delete requestPayload.connectorIds;
  }

  private commandResponseToResponsePayload(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload,
    commandResponse: CommandResponse
  ): BroadcastChannelResponsePayload {
    const responseStatus = this.commandResponseToResponseStatus(command, commandResponse);
    if (responseStatus === ResponseStatus.SUCCESS) {
      return {
        hashId: this.chargingStation.stationInfo.hashId,
        status: responseStatus,
      };
    }
    return {
      hashId: this.chargingStation.stationInfo.hashId,
      status: responseStatus,
      command,
      requestPayload,
      commandResponse,
    };
  }

  private commandResponseToResponseStatus(
    command: BroadcastChannelProcedureName,
    commandResponse: CommandResponse
  ): ResponseStatus {
    switch (command) {
      case BroadcastChannelProcedureName.START_TRANSACTION:
      case BroadcastChannelProcedureName.STOP_TRANSACTION:
      case BroadcastChannelProcedureName.AUTHORIZE:
        if (
          (
            commandResponse as
              | StartTransactionResponse
              | StopTransactionResponse
              | AuthorizeResponse
          )?.idTagInfo?.status === AuthorizationStatus.ACCEPTED
        ) {
          return ResponseStatus.SUCCESS;
        }
        return ResponseStatus.FAILURE;
      case BroadcastChannelProcedureName.BOOT_NOTIFICATION:
        if (commandResponse?.status === RegistrationStatus.ACCEPTED) {
          return ResponseStatus.SUCCESS;
        }
        return ResponseStatus.FAILURE;
      case BroadcastChannelProcedureName.DATA_TRANSFER:
        if (commandResponse?.status === DataTransferStatus.ACCEPTED) {
          return ResponseStatus.SUCCESS;
        }
        return ResponseStatus.FAILURE;
      case BroadcastChannelProcedureName.STATUS_NOTIFICATION:
      case BroadcastChannelProcedureName.METER_VALUES:
        if (Utils.isEmptyObject(commandResponse) === true) {
          return ResponseStatus.SUCCESS;
        }
        return ResponseStatus.FAILURE;
      case BroadcastChannelProcedureName.HEARTBEAT:
        if ('currentTime' in commandResponse) {
          return ResponseStatus.SUCCESS;
        }
        return ResponseStatus.FAILURE;
      default:
        return ResponseStatus.FAILURE;
    }
  }
}
