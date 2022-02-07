import { AuthorizeResponse, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../../types/ocpp/Transaction';
import { DiagnosticsStatus, IncomingRequestCommand, RequestCommand, SendParams } from '../../types/ocpp/Requests';

import { BootNotificationResponse } from '../../types/ocpp/Responses';
import { ChargePointErrorCode } from '../../types/ocpp/ChargePointErrorCode';
import { ChargePointStatus } from '../../types/ocpp/ChargePointStatus';
import ChargingStation from '../ChargingStation';
import Constants from '../../utils/Constants';
import { ErrorType } from '../../types/ocpp/ErrorType';
import { JsonType } from '../../types/JsonType';
import { MessageType } from '../../types/ocpp/MessageType';
import { MeterValue } from '../../types/ocpp/MeterValues';
import OCPPError from '../../exception/OCPPError';
import OCPPResponseService from './OCPPResponseService';
import PerformanceStatistics from '../../performance/PerformanceStatistics';
import Utils from '../../utils/Utils';
import logger from '../../utils/Logger';

export default abstract class OCPPRequestService {
  public chargingStation: ChargingStation;
  protected ocppResponseService: OCPPResponseService;

  constructor(chargingStation: ChargingStation, ocppResponseService: OCPPResponseService) {
    this.chargingStation = chargingStation;
    this.ocppResponseService = ocppResponseService;
  }

  public async sendMessage(messageId: string, messageData: JsonType | OCPPError, messageType: MessageType, commandName: RequestCommand | IncomingRequestCommand,
      params: SendParams = {
        skipBufferingOnError: false,
        triggerMessage: false
      }): Promise<JsonType | OCPPError | string> {
    if (this.chargingStation.isInRejectedState() || (this.chargingStation.isInPendingState() && !params.triggerMessage)) {
      throw new OCPPError(ErrorType.SECURITY_ERROR, 'Cannot send command payload if the charging station is not in accepted state', commandName);
    } else if ((this.chargingStation.isInUnknownState() && (commandName === RequestCommand.BOOT_NOTIFICATION || commandName === IncomingRequestCommand.CHANGE_CONFIGURATION))
      || this.chargingStation.isInAcceptedState() || (this.chargingStation.isInPendingState() && params.triggerMessage)) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      // Send a message through wsConnection
      return Utils.promiseWithTimeout(new Promise((resolve, reject) => {
        const messageToSend = this.buildMessageToSend(messageId, messageData, messageType, commandName, responseCallback, rejectCallback);
        if (this.chargingStation.getEnableStatistics()) {
          this.chargingStation.performanceStatistics.addRequestStatistic(commandName, messageType);
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
          const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, `WebSocket closed for buffered message id '${messageId}' with content '${messageToSend}'`, commandName, messageData?.details as JsonType ?? {});
          if (messageType === MessageType.CALL_MESSAGE) {
            // Reject it but keep the request in the cache
            return reject(ocppError);
          }
          return rejectCallback(ocppError, false);
        } else {
          // Reject it
          return rejectCallback(new OCPPError(ErrorType.GENERIC_ERROR, `WebSocket closed for non buffered message id '${messageId}' with content '${messageToSend}'`, commandName, messageData?.details as JsonType ?? {}), false);
        }
        // Response?
        if (messageType !== MessageType.CALL_MESSAGE) {
          // Yes: send Ok
          return resolve(messageData);
        }

        /**
         * Function that will receive the request's response
         *
         * @param payload
         * @param requestPayload
         */
        async function responseCallback(payload: JsonType | string, requestPayload: JsonType): Promise<void> {
          if (self.chargingStation.getEnableStatistics()) {
            self.chargingStation.performanceStatistics.addRequestStatistic(commandName, MessageType.CALL_RESULT_MESSAGE);
          }
          // Handle the request's response
          try {
            await self.ocppResponseService.handleResponse(commandName as RequestCommand, payload, requestPayload);
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
            self.chargingStation.performanceStatistics.addRequestStatistic(commandName, MessageType.CALL_ERROR_MESSAGE);
          }
          logger.error(`${self.chargingStation.logPrefix()} Error %j occurred when calling command %s with message data %j`, error, commandName, messageData);
          self.chargingStation.requests.delete(messageId);
          reject(error);
        }
      }), Constants.OCPP_WEBSOCKET_TIMEOUT, new OCPPError(ErrorType.GENERIC_ERROR, `Timeout for message id '${messageId}'`, commandName, messageData?.details as JsonType ?? {}), () => {
        messageType === MessageType.CALL_MESSAGE && this.chargingStation.requests.delete(messageId);
      });
    } else {
      throw new OCPPError(ErrorType.SECURITY_ERROR, 'Cannot send command payload if the charging station is in unknown state', commandName);
    }
  }

  protected handleRequestError(commandName: RequestCommand, error: Error): void {
    logger.error(this.chargingStation.logPrefix() + ' Request command ' + commandName + ' error: %j', error);
    throw error;
  }

  private buildMessageToSend(messageId: string, messageData: JsonType | OCPPError, messageType: MessageType, commandName: RequestCommand | IncomingRequestCommand,
      responseCallback: (payload: JsonType | string, requestPayload: JsonType) => Promise<void>,
      rejectCallback: (error: OCPPError, requestStatistic?: boolean) => void): string {
    let messageToSend: string;
    // Type of message
    switch (messageType) {
      // Request
      case MessageType.CALL_MESSAGE:
        // Build request
        this.chargingStation.requests.set(messageId, [responseCallback, rejectCallback, commandName, messageData]);
        messageToSend = JSON.stringify([messageType, messageId, commandName, messageData]);
        break;
      // Response
      case MessageType.CALL_RESULT_MESSAGE:
        // Build response
        messageToSend = JSON.stringify([messageType, messageId, messageData]);
        break;
      // Error Message
      case MessageType.CALL_ERROR_MESSAGE:
        // Build Error Message
        messageToSend = JSON.stringify([messageType, messageId, messageData?.code ?? ErrorType.GENERIC_ERROR, messageData?.message ?? '', messageData?.details ?? {}]);
        break;
    }
    return messageToSend;
  }

  public abstract sendHeartbeat(params?: SendParams): Promise<void>;
  public abstract sendBootNotification(chargePointModel: string, chargePointVendor: string, chargeBoxSerialNumber?: string, firmwareVersion?: string, chargePointSerialNumber?: string, iccid?: string, imsi?: string, meterSerialNumber?: string, meterType?: string, params?: SendParams): Promise<BootNotificationResponse>;
  public abstract sendStatusNotification(connectorId: number, status: ChargePointStatus, errorCode?: ChargePointErrorCode): Promise<void>;
  public abstract sendAuthorize(connectorId: number, idTag?: string): Promise<AuthorizeResponse>;
  public abstract sendStartTransaction(connectorId: number, idTag?: string): Promise<StartTransactionResponse>;
  public abstract sendStopTransaction(transactionId: number, meterStop: number, idTag?: string, reason?: StopTransactionReason): Promise<StopTransactionResponse>;
  public abstract sendMeterValues(connectorId: number, transactionId: number, interval: number): Promise<void>;
  public abstract sendTransactionBeginMeterValues(connectorId: number, transactionId: number, beginMeterValue: MeterValue): Promise<void>;
  public abstract sendTransactionEndMeterValues(connectorId: number, transactionId: number, endMeterValue: MeterValue): Promise<void>;
  public abstract sendDiagnosticsStatusNotification(diagnosticsStatus: DiagnosticsStatus): Promise<void>;
  public abstract sendResult(messageId: string, resultMessageData: JsonType, commandName: RequestCommand | IncomingRequestCommand): Promise<JsonType>;
  public abstract sendError(messageId: string, error: OCPPError, commandName: RequestCommand | IncomingRequestCommand): Promise<JsonType>;
}
