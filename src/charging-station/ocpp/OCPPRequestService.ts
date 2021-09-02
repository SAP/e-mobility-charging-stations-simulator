import { AuthorizeResponse, StartTransactionResponse, StopTransactionReason, StopTransactionResponse } from '../../types/ocpp/Transaction';
import { DiagnosticsStatus, IncomingRequestCommand, RequestCommand } from '../../types/ocpp/Requests';

import { BootNotificationResponse } from '../../types/ocpp/Responses';
import { ChargePointErrorCode } from '../../types/ocpp/ChargePointErrorCode';
import { ChargePointStatus } from '../../types/ocpp/ChargePointStatus';
import ChargingStation from '../ChargingStation';
import Constants from '../../utils/Constants';
import { ErrorType } from '../../types/ocpp/ErrorType';
import { MessageType } from '../../types/ocpp/MessageType';
import { MeterValue } from '../../types/ocpp/MeterValues';
import OCPPError from './OCPPError';
import OCPPResponseService from './OCPPResponseService';
import PerformanceStatistics from '../../performance/PerformanceStatistics';
import logger from '../../utils/Logger';

export default abstract class OCPPRequestService {
  public chargingStation: ChargingStation;
  protected ocppResponseService: OCPPResponseService;

  constructor(chargingStation: ChargingStation, ocppResponseService: OCPPResponseService) {
    this.chargingStation = chargingStation;
    this.ocppResponseService = ocppResponseService;
  }

  public async sendMessage(messageId: string, commandParams: any, messageType: MessageType, commandName: RequestCommand | IncomingRequestCommand,
      skipBufferingOnError = false): Promise<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    // Send a message through wsConnection
    return new Promise((resolve: (value?: any | PromiseLike<any>) => void, reject: (reason?: any) => void) => {
      let messageToSend: string;
      // Type of message
      switch (messageType) {
        // Request
        case MessageType.CALL_MESSAGE:
          // Build request
          this.chargingStation.requests[messageId] = [responseCallback, rejectCallback, commandParams as Record<string, unknown>];
          messageToSend = JSON.stringify([messageType, messageId, commandName, commandParams]);
          break;
        // Response
        case MessageType.CALL_RESULT_MESSAGE:
          // Build response
          messageToSend = JSON.stringify([messageType, messageId, commandParams]);
          break;
        // Error Message
        case MessageType.CALL_ERROR_MESSAGE:
          // Build Error Message
          messageToSend = JSON.stringify([messageType, messageId, commandParams.code ? commandParams.code : ErrorType.GENERIC_ERROR, commandParams.message ? commandParams.message : '', commandParams.details ? commandParams.details : {}]);
          break;
      }
      if (this.chargingStation.getEnableStatistics()) {
        this.chargingStation.performanceStatistics.addRequestStatistic(commandName, messageType);
      }
      // Check if wsConnection opened
      if (this.chargingStation.isWebSocketConnectionOpened()) {
        // Yes: Send Message
        const beginId = PerformanceStatistics.beginMeasure(commandName);
        this.chargingStation.wsConnection.send(messageToSend);
        PerformanceStatistics.endMeasure(commandName, beginId);
      } else if (!skipBufferingOnError) {
        // Buffer it
        this.chargingStation.addToMessageQueue(messageToSend);
        // Reject it
        return rejectCallback(new OCPPError(commandParams.code ? commandParams.code : ErrorType.GENERIC_ERROR, commandParams.message ? commandParams.message : `WebSocket closed for message id '${messageId}' with content '${messageToSend}', message buffered`, commandParams.details ? commandParams.details : {}));
      }
      // Response?
      if (messageType === MessageType.CALL_RESULT_MESSAGE) {
        // Yes: send Ok
        resolve();
      } else if (messageType === MessageType.CALL_ERROR_MESSAGE) {
        // Send timeout
        setTimeout(() => rejectCallback(new OCPPError(commandParams.code ? commandParams.code : ErrorType.GENERIC_ERROR, commandParams.message ? commandParams.message : `Timeout for message id '${messageId}' with content '${messageToSend}'`, commandParams.details ? commandParams.details : {})), Constants.OCPP_ERROR_TIMEOUT);
      }

      /**
       * Function that will receive the request's response
       *
       * @param payload
       * @param requestPayload
       */
      async function responseCallback(payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>): Promise<void> {
        if (self.chargingStation.getEnableStatistics()) {
          self.chargingStation.performanceStatistics.addRequestStatistic(commandName, MessageType.CALL_RESULT_MESSAGE);
        }
        // Send the response
        await self.ocppResponseService.handleResponse(commandName as RequestCommand, payload, requestPayload);
        resolve(payload);
      }

      /**
       * Function that will receive the request's rejection
       *
       * @param error
       */
      function rejectCallback(error: OCPPError): void {
        if (self.chargingStation.getEnableStatistics()) {
          self.chargingStation.performanceStatistics.addRequestStatistic(commandName, MessageType.CALL_ERROR_MESSAGE);
        }
        logger.debug(`${self.chargingStation.logPrefix()} Error: %j occurred when calling command %s with parameters: %j`, error, commandName, commandParams);
        // Build Exception
        // eslint-disable-next-line no-empty-function
        self.chargingStation.requests[messageId] = [() => { }, () => { }, {}];
        // Send error
        reject(error);
      }
    });
  }

  protected handleRequestError(commandName: RequestCommand, error: Error): void {
    logger.error(this.chargingStation.logPrefix() + ' Request command ' + commandName + ' error: %j', error);
    throw error;
  }

  public abstract sendHeartbeat(): Promise<void>;
  public abstract sendBootNotification(chargePointModel: string, chargePointVendor: string, chargeBoxSerialNumber?: string, firmwareVersion?: string, chargePointSerialNumber?: string, iccid?: string, imsi?: string, meterSerialNumber?: string, meterType?: string): Promise<BootNotificationResponse>;
  public abstract sendStatusNotification(connectorId: number, status: ChargePointStatus, errorCode?: ChargePointErrorCode): Promise<void>;
  public abstract sendAuthorize(connectorId: number, idTag?: string): Promise<AuthorizeResponse>;
  public abstract sendStartTransaction(connectorId: number, idTag?: string): Promise<StartTransactionResponse>;
  public abstract sendStopTransaction(transactionId: number, meterStop: number, idTag?: string, reason?: StopTransactionReason): Promise<StopTransactionResponse>;
  public abstract sendMeterValues(connectorId: number, transactionId: number, interval: number): Promise<void>;
  public abstract sendTransactionBeginMeterValues(connectorId: number, transactionId: number, beginMeterValue: MeterValue): Promise<void>;
  public abstract sendTransactionEndMeterValues(connectorId: number, transactionId: number, endMeterValue: MeterValue): Promise<void>;
  public abstract sendDiagnosticsStatusNotification(diagnosticsStatus: DiagnosticsStatus): Promise<void>;
  public abstract sendError(messageId: string, error: OCPPError, commandName: RequestCommand | IncomingRequestCommand): Promise<unknown>;
}
