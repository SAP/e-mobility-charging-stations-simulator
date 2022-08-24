import BaseError from '../exception/BaseError';
import { RequestCommand } from '../types/ocpp/Requests';
import {
  AuthorizationStatus,
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionReason,
  StopTransactionRequest,
  StopTransactionResponse,
} from '../types/ocpp/Transaction';
import {
  BroadcastChannelProcedureName,
  BroadcastChannelRequest,
  BroadcastChannelRequestPayload,
  BroadcastChannelResponsePayload,
  MessageEvent,
} from '../types/WorkerBroadcastChannel';
import { ResponseStatus } from '../ui/web/src/type/UIProtocol';
import logger from '../utils/Logger';
import ChargingStation from './ChargingStation';
import WorkerBroadcastChannel from './WorkerBroadcastChannel';

const moduleName = 'ChargingStationWorkerBroadcastChannel';

type CommandResponse = StartTransactionResponse | StopTransactionResponse;

export default class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    super();
    this.chargingStation = chargingStation;
    this.onmessage = this.requestHandler.bind(this) as (message: MessageEvent) => void;
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: MessageEvent) => void;
  }

  private async requestHandler(messageEvent: MessageEvent): Promise<void> {
    if (this.isResponse(messageEvent.data)) {
      return;
    }

    const [uuid, command, requestPayload] = messageEvent.data as BroadcastChannelRequest;

    if (requestPayload?.hashId !== this.chargingStation.hashId) {
      return;
    }

    let responsePayload: BroadcastChannelResponsePayload;
    let commandResponse: CommandResponse;
    try {
      commandResponse = await this.commandHandler(command, requestPayload);
      if (commandResponse === undefined) {
        responsePayload = { status: ResponseStatus.SUCCESS };
      } else {
        responsePayload = { status: this.commandResponseToResponseStatus(commandResponse) };
      }
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: Handle request error:`,
        error
      );
      responsePayload = {
        status: ResponseStatus.FAILURE,
        command,
        requestPayload,
        commandResponse,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
      };
    }
    this.sendResponse([uuid, responsePayload]);
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.messageErrorHandler: Error at handling message:`,
      { messageEvent, messageEventData: messageEvent.data }
    );
  }

  private async commandHandler(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
  ): Promise<CommandResponse | undefined> {
    switch (command) {
      case BroadcastChannelProcedureName.START_TRANSACTION:
        return this.chargingStation.ocppRequestService.requestHandler<
          StartTransactionRequest,
          StartTransactionResponse
        >(this.chargingStation, RequestCommand.START_TRANSACTION, {
          connectorId: requestPayload.connectorId,
          idTag: requestPayload.idTag,
        });
      case BroadcastChannelProcedureName.STOP_TRANSACTION:
        return this.chargingStation.ocppRequestService.requestHandler<
          StopTransactionRequest,
          StopTransactionResponse
        >(this.chargingStation, RequestCommand.STOP_TRANSACTION, {
          transactionId: requestPayload.transactionId,
          meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
            requestPayload.transactionId
          ),
          idTag: this.chargingStation.getTransactionIdTag(requestPayload.transactionId),
          reason: StopTransactionReason.NONE,
        });
      case BroadcastChannelProcedureName.START_CHARGING_STATION:
        this.chargingStation.start();
        break;
      case BroadcastChannelProcedureName.STOP_CHARGING_STATION:
        await this.chargingStation.stop();
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`Unknown broadcast channel command: ${command}`);
    }
  }

  private commandResponseToResponseStatus(commandResponse: CommandResponse): ResponseStatus {
    if (commandResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
      return ResponseStatus.SUCCESS;
    }
    return ResponseStatus.FAILURE;
  }
}
