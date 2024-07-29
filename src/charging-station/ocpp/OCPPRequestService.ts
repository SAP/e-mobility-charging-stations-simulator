import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'

import type { ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import { PerformanceStatistics } from '../../performance/index.js'
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
} from '../../types/index.js'
import {
  clone,
  formatDurationMilliSeconds,
  handleSendMessageError,
  logger,
} from '../../utils/index.js'
import { OCPPConstants } from './OCPPConstants.js'
import type { OCPPResponseService } from './OCPPResponseService.js'
import {
  ajvErrorsToErrorType,
  convertDateToISOString,
  getMessageTypeString,
} from './OCPPServiceUtils.js'
type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

const moduleName = 'OCPPRequestService'

const defaultRequestParams: RequestParams = {
  skipBufferingOnError: false,
  triggerMessage: false,
  throwError: false,
}

export abstract class OCPPRequestService {
  private static instance: OCPPRequestService | null = null
  private readonly version: OCPPVersion
  private readonly ocppResponseService: OCPPResponseService
  protected readonly ajv: Ajv
  protected abstract payloadValidateFunctions: Map<RequestCommand, ValidateFunction<JsonType>>

  protected constructor (version: OCPPVersion, ocppResponseService: OCPPResponseService) {
    this.version = version
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    })
    ajvFormats(this.ajv)
    this.ocppResponseService = ocppResponseService
    this.requestHandler = this.requestHandler.bind(this)
    this.sendMessage = this.sendMessage.bind(this)
    this.sendResponse = this.sendResponse.bind(this)
    this.sendError = this.sendError.bind(this)
    this.internalSendMessage = this.internalSendMessage.bind(this)
    this.buildMessageToSend = this.buildMessageToSend.bind(this)
    this.validateRequestPayload = this.validateRequestPayload.bind(this)
    this.validateIncomingRequestResponsePayload =
      this.validateIncomingRequestResponsePayload.bind(this)
  }

  public static getInstance<T extends OCPPRequestService>(
    this: new (ocppResponseService: OCPPResponseService) => T,
    ocppResponseService: OCPPResponseService
  ): T {
    if (OCPPRequestService.instance === null) {
      OCPPRequestService.instance = new this(ocppResponseService)
    }
    return OCPPRequestService.instance as T
  }

  public async sendResponse (
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
      )
    } catch (error) {
      handleSendMessageError(
        chargingStation,
        commandName,
        MessageType.CALL_RESULT_MESSAGE,
        error as Error,
        {
          throwError: true,
        }
      )
      return null
    }
  }

  public async sendError (
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
      )
    } catch (error) {
      handleSendMessageError(
        chargingStation,
        commandName,
        MessageType.CALL_ERROR_MESSAGE,
        error as Error
      )
      return null
    }
  }

  protected async sendMessage (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: RequestCommand,
    params?: RequestParams
  ): Promise<ResponseType> {
    params = {
      ...defaultRequestParams,
      ...params,
    }
    try {
      return await this.internalSendMessage(
        chargingStation,
        messageId,
        messagePayload,
        MessageType.CALL_MESSAGE,
        commandName,
        params
      )
    } catch (error) {
      handleSendMessageError(
        chargingStation,
        commandName,
        MessageType.CALL_MESSAGE,
        error as Error,
        {
          throwError: params.throwError,
        }
      )
      return null
    }
  }

  private validateRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand | IncomingRequestCommand,
    payload: T
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true
    }
    if (!this.payloadValidateFunctions.has(commandName as RequestCommand)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateRequestPayload: No JSON schema found for command '${commandName}' PDU validation`
      )
      return true
    }
    const validate = this.payloadValidateFunctions.get(commandName as RequestCommand)
    payload = clone<T>(payload)
    convertDateToISOString<T>(payload)
    if (validate?.(payload) === true) {
      return true
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateRequestPayload: Command '${commandName}' request PDU is invalid: %j`,
      validate?.errors
    )
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      ajvErrorsToErrorType(validate?.errors),
      'Request PDU is invalid',
      commandName,
      JSON.stringify(validate?.errors, undefined, 2)
    )
  }

  private validateIncomingRequestResponsePayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand | IncomingRequestCommand,
    payload: T
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true
    }
    if (
      !this.ocppResponseService.incomingRequestResponsePayloadValidateFunctions.has(
        commandName as IncomingRequestCommand
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestResponsePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
      )
      return true
    }
    const validate = this.ocppResponseService.incomingRequestResponsePayloadValidateFunctions.get(
      commandName as IncomingRequestCommand
    )
    payload = clone<T>(payload)
    convertDateToISOString<T>(payload)
    if (validate?.(payload) === true) {
      return true
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestResponsePayload: Command '${commandName}' incoming request response PDU is invalid: %j`,
      validate?.errors
    )
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      ajvErrorsToErrorType(validate?.errors),
      'Incoming request response PDU is invalid',
      commandName,
      JSON.stringify(validate?.errors, undefined, 2)
    )
  }

  private async internalSendMessage (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: RequestCommand | IncomingRequestCommand,
    params?: RequestParams
  ): Promise<ResponseType> {
    params = {
      ...defaultRequestParams,
      ...params,
    }
    if (
      (chargingStation.inUnknownState() && commandName === RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState()) ||
      chargingStation.inAcceptedState() ||
      (chargingStation.inPendingState() &&
        (params.triggerMessage === true || messageType === MessageType.CALL_RESULT_MESSAGE))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this
      // Send a message through wsConnection
      return await new Promise<ResponseType>((resolve, reject: (reason?: unknown) => void) => {
        /**
         * Function that will receive the request's response
         * @param payload -
         * @param requestPayload -
         */
        const responseCallback = (payload: JsonType, requestPayload: JsonType): void => {
          if (chargingStation.stationInfo?.enableStatistics === true) {
            chargingStation.performanceStatistics?.addRequestStatistic(
              commandName,
              MessageType.CALL_RESULT_MESSAGE
            )
          }
          // Handle the request's response
          self.ocppResponseService
            .responseHandler(
              chargingStation,
              commandName as RequestCommand,
              payload,
              requestPayload
            )
            .then(() => {
              resolve(payload)
              return undefined
            })
            .finally(() => {
              chargingStation.requests.delete(messageId)
              chargingStation.emit(ChargingStationEvents.updated)
            })
            .catch(reject)
        }

        /**
         * Function that will receive the request's error response
         * @param ocppError -
         * @param requestStatistic -
         */
        const errorCallback = (ocppError: OCPPError, requestStatistic = true): void => {
          if (requestStatistic && chargingStation.stationInfo?.enableStatistics === true) {
            chargingStation.performanceStatistics?.addRequestStatistic(
              commandName,
              MessageType.CALL_ERROR_MESSAGE
            )
          }
          logger.error(
            `${chargingStation.logPrefix()} Error occurred at ${getMessageTypeString(
              messageType
            )} command ${commandName} with PDU %j:`,
            messagePayload,
            ocppError
          )
          chargingStation.requests.delete(messageId)
          chargingStation.emit(ChargingStationEvents.updated)
          reject(ocppError)
        }

        const handleSendError = (ocppError: OCPPError): void => {
          if (params.skipBufferingOnError === false) {
            // Buffer
            chargingStation.bufferMessage(messageToSend)
            if (messageType === MessageType.CALL_MESSAGE) {
              this.setCachedRequest(
                chargingStation,
                messageId,
                messagePayload as JsonType,
                commandName,
                responseCallback,
                errorCallback
              )
            }
          } else if (
            params.skipBufferingOnError === true &&
            messageType === MessageType.CALL_MESSAGE
          ) {
            // Remove request from the cache
            chargingStation.requests.delete(messageId)
          }
          reject(ocppError)
        }

        if (chargingStation.stationInfo?.enableStatistics === true) {
          chargingStation.performanceStatistics?.addRequestStatistic(commandName, messageType)
        }
        const messageToSend = this.buildMessageToSend(
          chargingStation,
          messageId,
          messagePayload,
          messageType,
          commandName
        )
        // Check if wsConnection opened
        if (chargingStation.isWebSocketConnectionOpened()) {
          const beginId = PerformanceStatistics.beginMeasure(commandName)
          const sendTimeout = setTimeout(() => {
            handleSendError(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `Timeout ${formatDurationMilliSeconds(
                  OCPPConstants.OCPP_WEBSOCKET_TIMEOUT
                )} reached for ${
                  params.skipBufferingOnError === false ? '' : 'non '
                }buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                (messagePayload as OCPPError).details
              )
            )
          }, OCPPConstants.OCPP_WEBSOCKET_TIMEOUT)
          chargingStation.wsConnection?.send(messageToSend, (error?: Error) => {
            PerformanceStatistics.endMeasure(commandName, beginId)
            clearTimeout(sendTimeout)
            if (error == null) {
              logger.debug(
                `${chargingStation.logPrefix()} >> Command '${commandName}' sent ${getMessageTypeString(
                  messageType
                )} payload: ${messageToSend}`
              )
              if (messageType === MessageType.CALL_MESSAGE) {
                this.setCachedRequest(
                  chargingStation,
                  messageId,
                  messagePayload as JsonType,
                  commandName,
                  responseCallback,
                  errorCallback
                )
              } else {
                // Resolve response
                resolve(messagePayload)
              }
            } else {
              handleSendError(
                new OCPPError(
                  ErrorType.GENERIC_ERROR,
                  `WebSocket errored for ${
                    params.skipBufferingOnError === false ? '' : 'non '
                  }buffered message id '${messageId}' with content '${messageToSend}'`,
                  commandName,
                  {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  }
                )
              )
            }
          })
        } else {
          handleSendError(
            new OCPPError(
              ErrorType.GENERIC_ERROR,
              `WebSocket closed for ${
                params.skipBufferingOnError === false ? '' : 'non '
              }buffered message id '${messageId}' with content '${messageToSend}'`,
              commandName,
              (messagePayload as OCPPError).details
            )
          )
        }
      })
    }
    throw new OCPPError(
      ErrorType.SECURITY_ERROR,
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Cannot send command ${commandName} PDU when the charging station is in ${chargingStation.bootNotificationResponse?.status} state on the central server`,
      commandName
    )
  }

  private buildMessageToSend (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: RequestCommand | IncomingRequestCommand
  ): string {
    let messageToSend: string
    // Type of message
    switch (messageType) {
      // Request
      case MessageType.CALL_MESSAGE:
        // Build request
        this.validateRequestPayload(chargingStation, commandName, messagePayload as JsonType)
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          commandName as RequestCommand,
          messagePayload as JsonType,
        ] satisfies OutgoingRequest)
        break
      // Response
      case MessageType.CALL_RESULT_MESSAGE:
        // Build response
        this.validateIncomingRequestResponsePayload(
          chargingStation,
          commandName,
          messagePayload as JsonType
        )
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          messagePayload as JsonType,
        ] satisfies Response)
        break
      // Error Message
      case MessageType.CALL_ERROR_MESSAGE:
        // Build Error Message
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          (messagePayload as OCPPError).code,
          (messagePayload as OCPPError).message,
          (messagePayload as OCPPError).details ?? {
            command: (messagePayload as OCPPError).command,
          },
        ] satisfies ErrorResponse)
        break
    }
    return messageToSend
  }

  private setCachedRequest (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: RequestCommand | IncomingRequestCommand,
    responseCallback: ResponseCallback,
    errorCallback: ErrorCallback
  ): void {
    chargingStation.requests.set(messageId, [
      responseCallback,
      errorCallback,
      commandName,
      messagePayload,
    ])
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public abstract requestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    commandParams?: ReqType,
    params?: RequestParams
  ): Promise<ResType>
}
