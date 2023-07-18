import { WorkerBroadcastChannel } from './WorkerBroadcastChannel';
import { BaseError, type OCPPError } from '../../exception';
import {
  AuthorizationStatus,
  type AuthorizeRequest,
  type AuthorizeResponse,
  type BootNotificationRequest,
  type BootNotificationResponse,
  BroadcastChannelProcedureName,
  type BroadcastChannelRequest,
  type BroadcastChannelRequestPayload,
  type BroadcastChannelResponsePayload,
  type DataTransferRequest,
  type DataTransferResponse,
  DataTransferStatus,
  type DiagnosticsStatusNotificationRequest,
  type DiagnosticsStatusNotificationResponse,
  type FirmwareStatusNotificationRequest,
  type FirmwareStatusNotificationResponse,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type MessageEvent,
  type MeterValuesRequest,
  type MeterValuesResponse,
  RegistrationStatusEnumType,
  RequestCommand,
  type RequestParams,
  ResponseStatus,
  StandardParametersKey,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
  type StopTransactionRequest,
  type StopTransactionResponse,
} from '../../types';
import { Constants, convertToInt, isEmptyObject, isNullOrUndefined, logger } from '../../utils';
import type { ChargingStation } from '../ChargingStation';
import { getConfigurationKey } from '../ChargingStationConfigurationUtils';
import { OCPP16ServiceUtils } from '../ocpp';

const moduleName = 'ChargingStationWorkerBroadcastChannel';

type CommandResponse =
  | StartTransactionResponse
  | StopTransactionResponse
  | AuthorizeResponse
  | BootNotificationResponse
  | StatusNotificationResponse
  | HeartbeatResponse
  | DataTransferResponse;

type CommandHandler = (
  requestPayload?: BroadcastChannelRequestPayload,
) => Promise<CommandResponse | void> | void;

export class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly commandHandlers: Map<BroadcastChannelProcedureName, CommandHandler>;
  private readonly chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    super();
    const requestParams: RequestParams = {
      throwError: true,
    };
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
          this.chargingStation.startAutomaticTransactionGenerator(requestPayload?.connectorIds),
      ],
      [
        BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
        (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.stopAutomaticTransactionGenerator(requestPayload?.connectorIds),
      ],
      [
        BroadcastChannelProcedureName.SET_SUPERVISION_URL,
        (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.setSupervisionUrl(requestPayload?.url as string),
      ],
      [
        BroadcastChannelProcedureName.START_TRANSACTION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            StartTransactionRequest,
            StartTransactionResponse
          >(this.chargingStation, RequestCommand.START_TRANSACTION, requestPayload, requestParams),
      ],
      [
        BroadcastChannelProcedureName.STOP_TRANSACTION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            StopTransactionRequest,
            StartTransactionResponse
          >(
            this.chargingStation,
            RequestCommand.STOP_TRANSACTION,
            {
              meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
                requestPayload!.transactionId!,
                true,
              ),
              ...requestPayload,
            },
            requestParams,
          ),
      ],
      [
        BroadcastChannelProcedureName.AUTHORIZE,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            AuthorizeRequest,
            AuthorizeResponse
          >(this.chargingStation, RequestCommand.AUTHORIZE, requestPayload, requestParams),
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
                throwError: true,
              },
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
          >(
            this.chargingStation,
            RequestCommand.STATUS_NOTIFICATION,
            requestPayload,
            requestParams,
          ),
      ],
      [
        BroadcastChannelProcedureName.HEARTBEAT,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            HeartbeatRequest,
            HeartbeatResponse
          >(this.chargingStation, RequestCommand.HEARTBEAT, requestPayload, requestParams),
      ],
      [
        BroadcastChannelProcedureName.METER_VALUES,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          const configuredMeterValueSampleInterval = getConfigurationKey(
            chargingStation,
            StandardParametersKey.MeterValueSampleInterval,
          );
          return this.chargingStation.ocppRequestService.requestHandler<
            MeterValuesRequest,
            MeterValuesResponse
          >(
            this.chargingStation,
            RequestCommand.METER_VALUES,
            {
              meterValue: [
                // FIXME: Implement OCPP version agnostic helpers
                OCPP16ServiceUtils.buildMeterValue(
                  this.chargingStation,
                  requestPayload!.connectorId!,
                  this.chargingStation.getConnectorStatus(requestPayload!.connectorId!)!
                    .transactionId!,
                  configuredMeterValueSampleInterval
                    ? convertToInt(configuredMeterValueSampleInterval.value) * 1000
                    : Constants.DEFAULT_METER_VALUES_INTERVAL,
                ),
              ],
              ...requestPayload,
            },
            requestParams,
          );
        },
      ],
      [
        BroadcastChannelProcedureName.DATA_TRANSFER,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            DataTransferRequest,
            DataTransferResponse
          >(this.chargingStation, RequestCommand.DATA_TRANSFER, requestPayload, requestParams),
      ],
      [
        BroadcastChannelProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            DiagnosticsStatusNotificationRequest,
            DiagnosticsStatusNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
            requestPayload,
            requestParams,
          ),
      ],
      [
        BroadcastChannelProcedureName.FIRMWARE_STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          this.chargingStation.ocppRequestService.requestHandler<
            FirmwareStatusNotificationRequest,
            FirmwareStatusNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
            requestPayload,
            requestParams,
          ),
      ],
    ]);
    this.chargingStation = chargingStation;
    this.onmessage = this.requestHandler.bind(this) as (message: unknown) => void;
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: unknown) => void;
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
      !isNullOrUndefined(requestPayload.hashIds) &&
      requestPayload.hashIds?.includes(this.chargingStation.stationInfo.hashId) === false
    ) {
      return;
    }
    if (!isNullOrUndefined(requestPayload.hashId)) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'hashId' field usage in PDU is deprecated, use 'hashIds' array instead`,
      );
      return;
    }
    let responsePayload: BroadcastChannelResponsePayload | undefined;
    let commandResponse: CommandResponse | void | undefined;
    try {
      commandResponse = await this.commandHandler(command, requestPayload);
      if (isNullOrUndefined(commandResponse) || isEmptyObject(commandResponse as CommandResponse)) {
        responsePayload = {
          hashId: this.chargingStation.stationInfo.hashId,
          status: ResponseStatus.SUCCESS,
        };
      } else {
        responsePayload = this.commandResponseToResponsePayload(
          command,
          requestPayload,
          commandResponse as CommandResponse,
        );
      }
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: Handle request error:`,
        error,
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
      this.sendResponse([uuid, responsePayload!]);
    }
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.messageErrorHandler: Error at handling message:`,
      messageEvent,
    );
  }

  private async commandHandler(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload,
  ): Promise<CommandResponse | void> {
    if (this.commandHandlers.has(command) === true) {
      this.cleanRequestPayload(command, requestPayload);
      return this.commandHandlers.get(command)!(requestPayload);
    }
    throw new BaseError(`Unknown worker broadcast channel command: ${command}`);
  }

  private cleanRequestPayload(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload,
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
    commandResponse: CommandResponse,
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
    commandResponse: CommandResponse,
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
        if (commandResponse?.status === RegistrationStatusEnumType.ACCEPTED) {
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
        if (isEmptyObject(commandResponse) === true) {
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
