import {
  AuthorizeResponse,
  StartTransactionResponse,
  StopTransactionReason,
  StopTransactionResponse,
} from '../../types/ocpp/Transaction';
import {
  DiagnosticsStatus,
  IncomingRequestCommand,
  RequestCommand,
  ResponseType,
  SendParams,
} from '../../types/ocpp/Requests';

import { BootNotificationResponse } from '../../types/ocpp/Responses';
import { ChargePointErrorCode } from '../../types/ocpp/ChargePointErrorCode';
import { ChargePointStatus } from '../../types/ocpp/ChargePointStatus';
import type ChargingStation from '../ChargingStation';
import Constants from '../../utils/Constants';
import { EmptyObject } from '../../types/EmptyObject';
import { ErrorType } from '../../types/ocpp/ErrorType';
import { HandleErrorParams } from '../../types/Error';
import { JsonType } from '../../types/JsonType';
import { MessageType } from '../../types/ocpp/MessageType';
import { MeterValue } from '../../types/ocpp/MeterValues';
import OCPPError from '../../exception/OCPPError';
import type OCPPResponseService from './OCPPResponseService';
import PerformanceStatistics from '../../performance/PerformanceStatistics';
import Utils from '../../utils/Utils';
import logger from '../../utils/Logger';

export default abstract class OCPPRequestService {
  private static readonly instances: Map<string, OCPPRequestService> = new Map<
    string,
    OCPPRequestService
  >();

  protected readonly chargingStation: ChargingStation;
  private readonly ocppResponseService: OCPPResponseService;

  protected constructor(
    chargingStation: ChargingStation,
    ocppResponseService: OCPPResponseService
  ) {
    this.chargingStation = chargingStation;
    this.ocppResponseService = ocppResponseService;
  }

  public static getInstance<T extends OCPPRequestService>(
    this: new (chargingStation: ChargingStation, ocppResponseService: OCPPResponseService) => T,
    chargingStation: ChargingStation,
    ocppResponseService: OCPPResponseService
  ): T {
    if (!OCPPRequestService.instances.has(chargingStation.id)) {
      OCPPRequestService.instances.set(
        chargingStation.id,
        new this(chargingStation, ocppResponseService)
      );
    }
    return OCPPRequestService.instances.get(chargingStation.id) as T;
  }

  public async sendResult(
    messageId: string,
    messagePayload: JsonType,
    commandName: IncomingRequestCommand
  ): Promise<ResponseType> {
    try {
      // Send result message
      return await this.internalSendMessage(
        messageId,
        messagePayload,
        MessageType.CALL_RESULT_MESSAGE,
        commandName
      );
    } catch (error) {
      this.handleRequestError(commandName, error as Error);
    }
  }

  public async sendError(
    messageId: string,
    ocppError: OCPPError,
    commandName: IncomingRequestCommand
  ): Promise<ResponseType> {
    try {
      // Send error message
      return await this.internalSendMessage(
        messageId,
        ocppError,
        MessageType.CALL_ERROR_MESSAGE,
        commandName
      );
    } catch (error) {
      this.handleRequestError(commandName, error as Error);
    }
  }

  protected async sendMessage(
    messageId: string,
    messagePayload: JsonType,
    commandName: RequestCommand,
    params: SendParams = {
      skipBufferingOnError: false,
      triggerMessage: false,
    }
  ): Promise<ResponseType> {
    try {
      return await this.internalSendMessage(
        messageId,
        messagePayload,
        MessageType.CALL_MESSAGE,
        commandName,
        params
      );
    } catch (error) {
      this.handleRequestError(commandName, error as Error, { throwError: false });
    }
  }

  private async internalSendMessage(
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName?: RequestCommand | IncomingRequestCommand,
    params: SendParams = {
      skipBufferingOnError: false,
      triggerMessage: false,
    }
  ): Promise<ResponseType> {
    if (
      (this.chargingStation.isInUnknownState() &&
        commandName === RequestCommand.BOOT_NOTIFICATION) ||
      (!this.chargingStation.getOcppStrictCompliance() &&
        this.chargingStation.isInUnknownState()) ||
      this.chargingStation.isInAcceptedState() ||
      (this.chargingStation.isInPendingState() && params.triggerMessage)
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      // Send a message through wsConnection
      return Utils.promiseWithTimeout(
        new Promise((resolve, reject) => {
          const messageToSend = this.buildMessageToSend(
            messageId,
            messagePayload,
            messageType,
            commandName,
            responseCallback,
            rejectCallback
          );
          if (this.chargingStation.getEnableStatistics()) {
            this.chargingStation.performanceStatistics.addRequestStatistic(
              commandName,
              messageType
            );
          }
          // Check if wsConnection opened
          if (this.chargingStation.isWebSocketConnectionOpened()) {
            // Yes: Send Message
            const beginId = PerformanceStatistics.beginMeasure(commandName);
            // FIXME: Handle sending error
            this.chargingStation.wsConnection.send(messageToSend);
            PerformanceStatistics.endMeasure(commandName, beginId);
          } else if (!params.skipBufferingOnError) {
            // Buffer it
            this.chargingStation.bufferMessage(messageToSend);
            const ocppError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              `WebSocket closed for buffered message id '${messageId}' with content '${messageToSend}'`,
              commandName,
              (messagePayload?.details as JsonType) ?? {}
            );
            if (messageType === MessageType.CALL_MESSAGE) {
              // Reject it but keep the request in the cache
              return reject(ocppError);
            }
            return rejectCallback(ocppError, false);
          } else {
            // Reject it
            return rejectCallback(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `WebSocket closed for non buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                (messagePayload?.details as JsonType) ?? {}
              ),
              false
            );
          }
          // Response?
          if (messageType !== MessageType.CALL_MESSAGE) {
            // Yes: send Ok
            return resolve(messagePayload);
          }

          /**
           * Function that will receive the request's response
           *
           * @param payload
           * @param requestPayload
           */
          async function responseCallback(
            payload: JsonType | string,
            requestPayload: JsonType
          ): Promise<void> {
            if (self.chargingStation.getEnableStatistics()) {
              self.chargingStation.performanceStatistics.addRequestStatistic(
                commandName,
                MessageType.CALL_RESULT_MESSAGE
              );
            }
            // Handle the request's response
            try {
              await self.ocppResponseService.handleResponse(
                commandName as RequestCommand,
                payload,
                requestPayload
              );
              resolve(payload);
            } catch (error) {
              reject(error);
              throw error;
            } finally {
              self.chargingStation.requests.delete(messageId);
            }
          }

          /**
           * Function that will receive the request's error response
           *
           * @param error
           * @param requestStatistic
           */
          function rejectCallback(error: OCPPError, requestStatistic = true): void {
            if (requestStatistic && self.chargingStation.getEnableStatistics()) {
              self.chargingStation.performanceStatistics.addRequestStatistic(
                commandName,
                MessageType.CALL_ERROR_MESSAGE
              );
            }
            logger.error(
              `${self.chargingStation.logPrefix()} Error %j occurred when calling command %s with message data %j`,
              error,
              commandName,
              messagePayload
            );
            self.chargingStation.requests.delete(messageId);
            reject(error);
          }
        }),
        Constants.OCPP_WEBSOCKET_TIMEOUT,
        new OCPPError(
          ErrorType.GENERIC_ERROR,
          `Timeout for message id '${messageId}'`,
          commandName,
          (messagePayload?.details as JsonType) ?? {}
        ),
        () => {
          messageType === MessageType.CALL_MESSAGE &&
            this.chargingStation.requests.delete(messageId);
        }
      );
    }
    throw new OCPPError(
      ErrorType.SECURITY_ERROR,
      `Cannot send command ${commandName} payload when the charging station is in ${this.chargingStation.getRegistrationStatus()} state on the central server`,
      commandName
    );
  }

  private buildMessageToSend(
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName?: RequestCommand | IncomingRequestCommand,
    responseCallback?: (payload: JsonType | string, requestPayload: JsonType) => Promise<void>,
    rejectCallback?: (error: OCPPError, requestStatistic?: boolean) => void
  ): string {
    let messageToSend: string;
    // Type of message
    switch (messageType) {
      // Request
      case MessageType.CALL_MESSAGE:
        // Build request
        this.chargingStation.requests.set(messageId, [
          responseCallback,
          rejectCallback,
          commandName,
          messagePayload,
        ]);
        messageToSend = JSON.stringify([messageType, messageId, commandName, messagePayload]);
        break;
      // Response
      case MessageType.CALL_RESULT_MESSAGE:
        // Build response
        messageToSend = JSON.stringify([messageType, messageId, messagePayload]);
        break;
      // Error Message
      case MessageType.CALL_ERROR_MESSAGE:
        // Build Error Message
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          messagePayload?.code ?? ErrorType.GENERIC_ERROR,
          messagePayload?.message ?? '',
          messagePayload?.details ?? { commandName },
        ]);
        break;
    }
    return messageToSend;
  }

  private handleRequestError(
    commandName: RequestCommand | IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<EmptyObject> = { throwError: true }
  ): void {
    logger.error(
      this.chargingStation.logPrefix() + ' Request command %s error: %j',
      commandName,
      error
    );
    if (params?.throwError) {
      throw error;
    }
  }

  public abstract sendHeartbeat(params?: SendParams): Promise<void>;
  public abstract sendBootNotification(
    chargePointModel: string,
    chargePointVendor: string,
    chargeBoxSerialNumber?: string,
    firmwareVersion?: string,
    chargePointSerialNumber?: string,
    iccid?: string,
    imsi?: string,
    meterSerialNumber?: string,
    meterType?: string,
    params?: SendParams
  ): Promise<BootNotificationResponse>;

  public abstract sendStatusNotification(
    connectorId: number,
    status: ChargePointStatus,
    errorCode?: ChargePointErrorCode
  ): Promise<void>;

  public abstract sendAuthorize(connectorId: number, idTag?: string): Promise<AuthorizeResponse>;
  public abstract sendStartTransaction(
    connectorId: number,
    idTag?: string
  ): Promise<StartTransactionResponse>;

  public abstract sendStopTransaction(
    transactionId: number,
    meterStop: number,
    idTag?: string,
    reason?: StopTransactionReason
  ): Promise<StopTransactionResponse>;

  public abstract sendMeterValues(
    connectorId: number,
    transactionId: number,
    interval: number
  ): Promise<void>;

  public abstract sendTransactionBeginMeterValues(
    connectorId: number,
    transactionId: number,
    beginMeterValue: MeterValue
  ): Promise<void>;

  public abstract sendTransactionEndMeterValues(
    connectorId: number,
    transactionId: number,
    endMeterValue: MeterValue
  ): Promise<void>;

  public abstract sendDiagnosticsStatusNotification(
    diagnosticsStatus: DiagnosticsStatus
  ): Promise<void>;
}
