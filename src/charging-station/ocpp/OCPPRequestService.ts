import { JSONSchemaType } from 'ajv';
import Ajv from 'ajv-draft-04';
import ajvFormats from 'ajv-formats';

import OCPPError from '../../exception/OCPPError';
import PerformanceStatistics from '../../performance/PerformanceStatistics';
import { EmptyObject } from '../../types/EmptyObject';
import { HandleErrorParams } from '../../types/Error';
import { JsonObject, JsonType } from '../../types/JsonType';
import { ErrorType } from '../../types/ocpp/ErrorType';
import { MessageType } from '../../types/ocpp/MessageType';
import {
  IncomingRequestCommand,
  OutgoingRequest,
  RequestCommand,
  RequestParams,
  ResponseType,
} from '../../types/ocpp/Requests';
import { ErrorResponse, Response } from '../../types/ocpp/Responses';
import Constants from '../../utils/Constants';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import type ChargingStation from '../ChargingStation';
import type OCPPResponseService from './OCPPResponseService';
import { OCPPServiceUtils } from './OCPPServiceUtils';

const moduleName = 'OCPPRequestService';

export default abstract class OCPPRequestService {
  private static instance: OCPPRequestService | null = null;
  private ajv: Ajv;

  private readonly ocppResponseService: OCPPResponseService;

  protected constructor(ocppResponseService: OCPPResponseService) {
    this.ocppResponseService = ocppResponseService;
    this.ajv = new Ajv();
    ajvFormats(this.ajv);
    this.requestHandler.bind(this);
    this.sendResponse.bind(this);
    this.sendError.bind(this);
    this.internalSendMessage.bind(this);
    this.buildMessageToSend.bind(this);
    this.validateRequestPayload.bind(this);
  }

  public static getInstance<T extends OCPPRequestService>(
    this: new (ocppResponseService: OCPPResponseService) => T,
    ocppResponseService: OCPPResponseService
  ): T {
    if (OCPPRequestService.instance === null) {
      OCPPRequestService.instance = new this(ocppResponseService);
    }
    return OCPPRequestService.instance as T;
  }

  public async sendResponse(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: IncomingRequestCommand
  ): Promise<ResponseType> {
    try {
      // Send response message
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        messagePayload,
        MessageType.CALL_RESULT_MESSAGE,
        commandName
      );
    } catch (error) {
      this.handleRequestError(chargingStation, commandName, error as Error);
    }
  }

  public async sendError(
    chargingStation: ChargingStation,
    messageId: string,
    ocppError: OCPPError,
    commandName: RequestCommand | IncomingRequestCommand
  ): Promise<ResponseType> {
    try {
      // Send error message
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        ocppError,
        MessageType.CALL_ERROR_MESSAGE,
        commandName
      );
    } catch (error) {
      this.handleRequestError(chargingStation, commandName, error as Error);
    }
  }

  protected async sendMessage(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: RequestCommand,
    params: RequestParams = {
      skipBufferingOnError: false,
      triggerMessage: false,
    }
  ): Promise<ResponseType> {
    try {
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        messagePayload,
        MessageType.CALL_MESSAGE,
        commandName,
        params
      );
    } catch (error) {
      this.handleRequestError(chargingStation, commandName, error as Error, { throwError: false });
    }
  }

  protected validateRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    schema: JSONSchemaType<T>,
    payload: T
  ): boolean {
    if (!chargingStation.getPayloadSchemaValidation()) {
      return true;
    }
    const validate = this.ajv.compile(schema);
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateRequestPayload: Request PDU is invalid: %j`,
      validate.errors
    );
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Request PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, null, 2)
    );
  }

  private async internalSendMessage(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName?: RequestCommand | IncomingRequestCommand,
    params: RequestParams = {
      skipBufferingOnError: false,
      triggerMessage: false,
    }
  ): Promise<ResponseType> {
    if (
      (chargingStation.isInUnknownState() && commandName === RequestCommand.BOOT_NOTIFICATION) ||
      (!chargingStation.getOcppStrictCompliance() && chargingStation.isInUnknownState()) ||
      chargingStation.isInAcceptedState() ||
      (chargingStation.isInPendingState() &&
        (params.triggerMessage || messageType === MessageType.CALL_RESULT_MESSAGE))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      // Send a message through wsConnection
      return Utils.promiseWithTimeout(
        new Promise((resolve, reject) => {
          const messageToSend = this.buildMessageToSend(
            chargingStation,
            messageId,
            messagePayload,
            messageType,
            commandName,
            responseCallback,
            errorCallback
          );
          if (chargingStation.getEnableStatistics()) {
            chargingStation.performanceStatistics.addRequestStatistic(commandName, messageType);
          }
          // Check if wsConnection opened
          if (chargingStation.isWebSocketConnectionOpened()) {
            // Yes: Send Message
            const beginId = PerformanceStatistics.beginMeasure(commandName);
            // FIXME: Handle sending error
            chargingStation.wsConnection.send(messageToSend);
            PerformanceStatistics.endMeasure(commandName, beginId);
            logger.debug(
              `${chargingStation.logPrefix()} >> Command '${commandName}' sent ${this.getMessageTypeString(
                messageType
              )} payload: ${messageToSend}`
            );
          } else if (!params.skipBufferingOnError) {
            // Buffer it
            chargingStation.bufferMessage(messageToSend);
            const ocppError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              `WebSocket closed for buffered message id '${messageId}' with content '${messageToSend}'`,
              commandName,
              (messagePayload as JsonObject)?.details ?? {}
            );
            if (messageType === MessageType.CALL_MESSAGE) {
              // Reject it but keep the request in the cache
              return reject(ocppError);
            }
            return errorCallback(ocppError, false);
          } else {
            // Reject it
            return errorCallback(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `WebSocket closed for non buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                (messagePayload as JsonObject)?.details ?? {}
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
            payload: JsonType,
            requestPayload: JsonType
          ): Promise<void> {
            if (chargingStation.getEnableStatistics()) {
              chargingStation.performanceStatistics.addRequestStatistic(
                commandName,
                MessageType.CALL_RESULT_MESSAGE
              );
            }
            // Handle the request's response
            try {
              await self.ocppResponseService.responseHandler(
                chargingStation,
                commandName as RequestCommand,
                payload,
                requestPayload
              );
              resolve(payload);
            } catch (error) {
              reject(error);
            } finally {
              chargingStation.requests.delete(messageId);
            }
          }

          /**
           * Function that will receive the request's error response
           *
           * @param error
           * @param requestStatistic
           */
          function errorCallback(error: OCPPError, requestStatistic = true): void {
            if (requestStatistic && chargingStation.getEnableStatistics()) {
              chargingStation.performanceStatistics.addRequestStatistic(
                commandName,
                MessageType.CALL_ERROR_MESSAGE
              );
            }
            logger.error(
              `${chargingStation.logPrefix()} Error %j occurred when calling command %s with message data %j`,
              error,
              commandName,
              messagePayload
            );
            chargingStation.requests.delete(messageId);
            reject(error);
          }
        }),
        Constants.OCPP_WEBSOCKET_TIMEOUT,
        new OCPPError(
          ErrorType.GENERIC_ERROR,
          `Timeout for message id '${messageId}'`,
          commandName,
          (messagePayload as JsonObject)?.details ?? {}
        ),
        () => {
          messageType === MessageType.CALL_MESSAGE && chargingStation.requests.delete(messageId);
        }
      );
    }
    throw new OCPPError(
      ErrorType.SECURITY_ERROR,
      `Cannot send command ${commandName} PDU when the charging station is in ${chargingStation.getRegistrationStatus()} state on the central server`,
      commandName
    );
  }

  private buildMessageToSend(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName?: RequestCommand | IncomingRequestCommand,
    responseCallback?: (payload: JsonType, requestPayload: JsonType) => Promise<void>,
    errorCallback?: (error: OCPPError, requestStatistic?: boolean) => void
  ): string {
    let messageToSend: string;
    // Type of message
    switch (messageType) {
      // Request
      case MessageType.CALL_MESSAGE:
        // Build request
        chargingStation.requests.set(messageId, [
          responseCallback,
          errorCallback,
          commandName,
          messagePayload as JsonType,
        ]);
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          commandName,
          messagePayload,
        ] as OutgoingRequest);
        break;
      // Response
      case MessageType.CALL_RESULT_MESSAGE:
        // Build response
        messageToSend = JSON.stringify([messageType, messageId, messagePayload] as Response);
        break;
      // Error Message
      case MessageType.CALL_ERROR_MESSAGE:
        // Build Error Message
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          (messagePayload as OCPPError)?.code ?? ErrorType.GENERIC_ERROR,
          (messagePayload as OCPPError)?.message ?? '',
          (messagePayload as OCPPError)?.details ?? { commandName },
        ] as ErrorResponse);
        break;
    }
    return messageToSend;
  }

  private getMessageTypeString(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        return 'request';
      case MessageType.CALL_RESULT_MESSAGE:
        return 'response';
      case MessageType.CALL_ERROR_MESSAGE:
        return 'error';
    }
  }

  private handleRequestError(
    chargingStation: ChargingStation,
    commandName: RequestCommand | IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<EmptyObject> = { throwError: true }
  ): void {
    logger.error(chargingStation.logPrefix() + ' Request command %s error: %j', commandName, error);
    if (params?.throwError) {
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public abstract requestHandler<Request extends JsonType, Response extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<Response>;
}
