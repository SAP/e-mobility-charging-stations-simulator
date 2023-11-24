import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import ajvFormats from 'ajv-formats';

import { OCPPConstants } from './OCPPConstants';
import type { OCPPResponseService } from './OCPPResponseService';
import { OCPPServiceUtils } from './OCPPServiceUtils';
import type { ChargingStation } from '../../charging-station';
import { OCPPError } from '../../exception';
import { PerformanceStatistics } from '../../performance';
import {
  ChargingStationEvents,
  type ErrorCallback,
  type ErrorResponse,
  ErrorType,
  type IncomingRequestCommand,
  type JsonType,
  MessageType,
  type OCPPVersion,
  type OutgoingRequest,
  RequestCommand,
  type RequestParams,
  type Response,
  type ResponseCallback,
  type ResponseType,
} from '../../types';
import {
  cloneObject,
  formatDurationMilliSeconds,
  handleSendMessageError,
  isNullOrUndefined,
  logger,
} from '../../utils';

const moduleName = 'OCPPRequestService';

const defaultRequestParams: RequestParams = {
  skipBufferingOnError: false,
  triggerMessage: false,
  throwError: false,
};

export abstract class OCPPRequestService {
  private static instance: OCPPRequestService | null = null;
  private readonly version: OCPPVersion;
  private readonly ajv: Ajv;
  private readonly ocppResponseService: OCPPResponseService;
  private readonly jsonValidateFunctions: Map<RequestCommand, ValidateFunction<JsonType>>;
  protected abstract jsonSchemas: Map<RequestCommand, JSONSchemaType<JsonType>>;

  protected constructor(version: OCPPVersion, ocppResponseService: OCPPResponseService) {
    this.version = version;
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    });
    ajvFormats(this.ajv);
    this.jsonValidateFunctions = new Map<RequestCommand, ValidateFunction<JsonType>>();
    this.ocppResponseService = ocppResponseService;
    this.requestHandler = this.requestHandler.bind(this) as <
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ReqType extends JsonType,
      ResType extends JsonType,
    >(
      chargingStation: ChargingStation,
      commandName: RequestCommand,
      commandParams?: JsonType,
      params?: RequestParams,
    ) => Promise<ResType>;
    this.sendMessage = this.sendMessage.bind(this) as (
      chargingStation: ChargingStation,
      messageId: string,
      messagePayload: JsonType,
      commandName: RequestCommand,
      params?: RequestParams,
    ) => Promise<ResponseType>;
    this.sendResponse = this.sendResponse.bind(this) as (
      chargingStation: ChargingStation,
      messageId: string,
      messagePayload: JsonType,
      commandName: IncomingRequestCommand,
    ) => Promise<ResponseType>;
    this.sendError = this.sendError.bind(this) as (
      chargingStation: ChargingStation,
      messageId: string,
      ocppError: OCPPError,
      commandName: RequestCommand | IncomingRequestCommand,
    ) => Promise<ResponseType>;
    this.internalSendMessage = this.internalSendMessage.bind(this) as (
      chargingStation: ChargingStation,
      messageId: string,
      messagePayload: JsonType | OCPPError,
      messageType: MessageType,
      commandName: RequestCommand | IncomingRequestCommand,
      params?: RequestParams,
    ) => Promise<ResponseType>;
    this.buildMessageToSend = this.buildMessageToSend.bind(this) as (
      chargingStation: ChargingStation,
      messageId: string,
      messagePayload: JsonType | OCPPError,
      messageType: MessageType,
      commandName: RequestCommand | IncomingRequestCommand,
    ) => string;
    this.validateRequestPayload = this.validateRequestPayload.bind(this) as <T extends JsonType>(
      chargingStation: ChargingStation,
      commandName: RequestCommand | IncomingRequestCommand,
      payload: T,
    ) => boolean;
    this.validateIncomingRequestResponsePayload = this.validateIncomingRequestResponsePayload.bind(
      this,
    ) as <T extends JsonType>(
      chargingStation: ChargingStation,
      commandName: RequestCommand | IncomingRequestCommand,
      payload: T,
    ) => boolean;
  }

  public static getInstance<T extends OCPPRequestService>(
    this: new (ocppResponseService: OCPPResponseService) => T,
    ocppResponseService: OCPPResponseService,
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
    commandName: IncomingRequestCommand,
  ): Promise<ResponseType> {
    try {
      // Send response message
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        messagePayload,
        MessageType.CALL_RESULT_MESSAGE,
        commandName,
      );
    } catch (error) {
      handleSendMessageError(chargingStation, commandName, error as Error, {
        throwError: true,
      });
      return null;
    }
  }

  public async sendError(
    chargingStation: ChargingStation,
    messageId: string,
    ocppError: OCPPError,
    commandName: RequestCommand | IncomingRequestCommand,
  ): Promise<ResponseType> {
    try {
      // Send error message
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        ocppError,
        MessageType.CALL_ERROR_MESSAGE,
        commandName,
      );
    } catch (error) {
      handleSendMessageError(chargingStation, commandName, error as Error);
      return null;
    }
  }

  protected async sendMessage(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: RequestCommand,
    params?: RequestParams,
  ): Promise<ResponseType> {
    params = {
      ...defaultRequestParams,
      ...params,
    };
    try {
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        messagePayload,
        MessageType.CALL_MESSAGE,
        commandName,
        params,
      );
    } catch (error) {
      handleSendMessageError(chargingStation, commandName, error as Error, {
        throwError: params.throwError,
      });
      return null;
    }
  }

  private validateRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand | IncomingRequestCommand,
    payload: T,
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true;
    }
    if (this.jsonSchemas.has(commandName as RequestCommand) === false) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateRequestPayload: No JSON schema found for command '${commandName}' PDU validation`,
      );
      return true;
    }
    const validate = this.getJsonRequestValidateFunction<T>(commandName as RequestCommand);
    payload = cloneObject<T>(payload);
    OCPPServiceUtils.convertDateToISOString<T>(payload);
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateRequestPayload: Command '${commandName}' request PDU is invalid: %j`,
      validate.errors,
    );
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Request PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, undefined, 2),
    );
  }

  private getJsonRequestValidateFunction<T extends JsonType>(commandName: RequestCommand) {
    if (this.jsonValidateFunctions.has(commandName) === false) {
      this.jsonValidateFunctions.set(
        commandName,
        this.ajv.compile<T>(this.jsonSchemas.get(commandName)!).bind(this),
      );
    }
    return this.jsonValidateFunctions.get(commandName)!;
  }

  private validateIncomingRequestResponsePayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand | IncomingRequestCommand,
    payload: T,
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true;
    }
    if (
      this.ocppResponseService.jsonIncomingRequestResponseSchemas.has(
        commandName as IncomingRequestCommand,
      ) === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestResponsePayload: No JSON schema found for command '${commandName}' PDU validation`,
      );
      return true;
    }
    const validate = this.getJsonRequestResponseValidateFunction<T>(
      commandName as IncomingRequestCommand,
    );
    payload = cloneObject<T>(payload);
    OCPPServiceUtils.convertDateToISOString<T>(payload);
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestResponsePayload: Command '${commandName}' reponse PDU is invalid: %j`,
      validate.errors,
    );
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, undefined, 2),
    );
  }

  private getJsonRequestResponseValidateFunction<T extends JsonType>(
    commandName: IncomingRequestCommand,
  ) {
    if (
      this.ocppResponseService.jsonIncomingRequestResponseValidateFunctions.has(commandName) ===
      false
    ) {
      this.ocppResponseService.jsonIncomingRequestResponseValidateFunctions.set(
        commandName,
        this.ajv
          .compile<T>(this.ocppResponseService.jsonIncomingRequestResponseSchemas.get(commandName)!)
          .bind(this),
      );
    }
    return this.ocppResponseService.jsonIncomingRequestResponseValidateFunctions.get(commandName)!;
  }

  private async internalSendMessage(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: RequestCommand | IncomingRequestCommand,
    params?: RequestParams,
  ): Promise<ResponseType> {
    params = {
      ...defaultRequestParams,
      ...params,
    };
    if (
      (chargingStation.inUnknownState() === true &&
        commandName === RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState() === true) ||
      chargingStation.inAcceptedState() === true ||
      (chargingStation.inPendingState() === true &&
        (params.triggerMessage === true || messageType === MessageType.CALL_RESULT_MESSAGE))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      // Send a message through wsConnection
      return new Promise<ResponseType>((resolve, reject) => {
        /**
         * Function that will receive the request's response
         *
         * @param payload -
         * @param requestPayload -
         */
        const responseCallback = (payload: JsonType, requestPayload: JsonType): void => {
          if (chargingStation.stationInfo?.enableStatistics === true) {
            chargingStation.performanceStatistics?.addRequestStatistic(
              commandName,
              MessageType.CALL_RESULT_MESSAGE,
            );
          }
          // Handle the request's response
          self.ocppResponseService
            .responseHandler(
              chargingStation,
              commandName as RequestCommand,
              payload,
              requestPayload,
            )
            .then(() => {
              resolve(payload);
            })
            .catch(reject)
            .finally(() => {
              chargingStation.requests.delete(messageId);
              chargingStation.emit(ChargingStationEvents.updated);
            });
        };

        /**
         * Function that will receive the request's error response
         *
         * @param ocppError -
         * @param requestStatistic -
         */
        const errorCallback = (ocppError: OCPPError, requestStatistic = true): void => {
          if (requestStatistic === true && chargingStation.stationInfo?.enableStatistics === true) {
            chargingStation.performanceStatistics?.addRequestStatistic(
              commandName,
              MessageType.CALL_ERROR_MESSAGE,
            );
          }
          logger.error(
            `${chargingStation.logPrefix()} Error occurred at ${OCPPServiceUtils.getMessageTypeString(
              messageType,
            )} command ${commandName} with PDU %j:`,
            messagePayload,
            ocppError,
          );
          chargingStation.requests.delete(messageId);
          chargingStation.emit(ChargingStationEvents.updated);
          reject(ocppError);
        };

        const handleSendError = (ocppError: OCPPError): void => {
          if (params?.skipBufferingOnError === false) {
            // Buffer
            chargingStation.bufferMessage(messageToSend);
            if (messageType === MessageType.CALL_MESSAGE) {
              this.cacheRequestPromise(
                chargingStation,
                messageId,
                messagePayload as JsonType,
                commandName,
                responseCallback,
                errorCallback,
              );
            }
          } else if (
            params?.skipBufferingOnError === true &&
            messageType === MessageType.CALL_MESSAGE
          ) {
            // Remove request from the cache
            chargingStation.requests.delete(messageId);
          }
          return reject(ocppError);
        };

        if (chargingStation.stationInfo?.enableStatistics === true) {
          chargingStation.performanceStatistics?.addRequestStatistic(commandName, messageType);
        }
        const messageToSend = this.buildMessageToSend(
          chargingStation,
          messageId,
          messagePayload,
          messageType,
          commandName,
        );
        // Check if wsConnection opened
        if (chargingStation.isWebSocketConnectionOpened() === true) {
          const beginId = PerformanceStatistics.beginMeasure(commandName);
          const sendTimeout = setTimeout(() => {
            return handleSendError(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `Timeout ${formatDurationMilliSeconds(
                  OCPPConstants.OCPP_WEBSOCKET_TIMEOUT,
                )} reached for ${
                  params?.skipBufferingOnError === false ? '' : 'non '
                }buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                (messagePayload as OCPPError).details,
              ),
            );
          }, OCPPConstants.OCPP_WEBSOCKET_TIMEOUT);
          chargingStation.wsConnection?.send(messageToSend, (error?: Error) => {
            PerformanceStatistics.endMeasure(commandName, beginId);
            clearTimeout(sendTimeout);
            if (isNullOrUndefined(error)) {
              logger.debug(
                `${chargingStation.logPrefix()} >> Command '${commandName}' sent ${OCPPServiceUtils.getMessageTypeString(
                  messageType,
                )} payload: ${messageToSend}`,
              );
              if (messageType === MessageType.CALL_MESSAGE) {
                this.cacheRequestPromise(
                  chargingStation,
                  messageId,
                  messagePayload as JsonType,
                  commandName,
                  responseCallback,
                  errorCallback,
                );
              } else {
                // Resolve response
                return resolve(messagePayload);
              }
            } else if (error) {
              return handleSendError(
                new OCPPError(
                  ErrorType.GENERIC_ERROR,
                  `WebSocket errored for ${
                    params?.skipBufferingOnError === false ? '' : 'non '
                  }buffered message id '${messageId}' with content '${messageToSend}'`,
                  commandName,
                  { name: error.name, message: error.message, stack: error.stack },
                ),
              );
            }
          });
        } else {
          return handleSendError(
            new OCPPError(
              ErrorType.GENERIC_ERROR,
              `WebSocket closed for ${
                params?.skipBufferingOnError === false ? '' : 'non '
              }buffered message id '${messageId}' with content '${messageToSend}'`,
              commandName,
              (messagePayload as OCPPError).details,
            ),
          );
        }
      });
    }
    throw new OCPPError(
      ErrorType.SECURITY_ERROR,
      `Cannot send command ${commandName} PDU when the charging station is in ${chargingStation?.bootNotificationResponse?.status} state on the central server`,
      commandName,
    );
  }

  private buildMessageToSend(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: RequestCommand | IncomingRequestCommand,
  ): string {
    let messageToSend: string;
    // Type of message
    switch (messageType) {
      // Request
      case MessageType.CALL_MESSAGE:
        // Build request
        this.validateRequestPayload(chargingStation, commandName, messagePayload as JsonType);
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
        this.validateIncomingRequestResponsePayload(
          chargingStation,
          commandName,
          messagePayload as JsonType,
        );
        messageToSend = JSON.stringify([messageType, messageId, messagePayload] as Response);
        break;
      // Error Message
      case MessageType.CALL_ERROR_MESSAGE:
        // Build Error Message
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          (messagePayload as OCPPError).code,
          (messagePayload as OCPPError).message,
          (messagePayload as OCPPError).details ?? {
            command: (messagePayload as OCPPError).command ?? commandName,
          },
        ] as ErrorResponse);
        break;
    }
    return messageToSend;
  }

  private cacheRequestPromise(
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: RequestCommand | IncomingRequestCommand,
    responseCallback: ResponseCallback,
    errorCallback: ErrorCallback,
  ): void {
    chargingStation.requests.set(messageId, [
      responseCallback,
      errorCallback,
      commandName,
      messagePayload,
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public abstract requestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    // FIXME: should be ReqType
    commandParams?: JsonType,
    params?: RequestParams,
  ): Promise<ResType>;
}
