import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../charging-station/index.js'
import type { OCPPResponseService } from './OCPPResponseService.js'

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
  ensureError,
  formatDurationMilliSeconds,
  generateUUID,
  getErrorMessage,
  getMessageTypeString,
  handleSendMessageError,
  logger,
} from '../../utils/index.js'
import { OCPPConstants } from './OCPPConstants.js'
import {
  type Ajv,
  createAjv,
  isRequestCommandSupported,
  validatePayload,
} from './OCPPServiceUtils.js'

const defaultRequestParams: RequestParams = {
  skipBufferingOnError: false,
  throwError: false,
  triggerMessage: false,
}

const moduleName = 'OCPPRequestService'

export abstract class OCPPRequestService {
  private static readonly instances = new Map<
    new (ocppResponseService: OCPPResponseService) => OCPPRequestService,
    OCPPRequestService
  >()

  protected readonly ajv: Ajv
  protected readonly moduleName: string
  protected abstract payloadValidatorFunctions: Map<RequestCommand, ValidateFunction<JsonType>>
  private readonly ocppResponseService: OCPPResponseService
  private readonly version: OCPPVersion

  protected constructor (
    version: OCPPVersion,
    ocppResponseService: OCPPResponseService,
    moduleName: string
  ) {
    this.version = version
    this.moduleName = moduleName
    this.ajv = createAjv()
    this.ocppResponseService = ocppResponseService
    this.requestHandler = this.requestHandler.bind(this)
    this.buildRequestPayload = this.buildRequestPayload.bind(this)
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
    if (!OCPPRequestService.instances.has(this)) {
      OCPPRequestService.instances.set(this, new this(ocppResponseService))
    }
    return OCPPRequestService.instances.get(this) as T
  }

  /**
   * Sends an OCPP request and awaits its response.
   * @param chargingStation - Target charging station.
   * @param commandName - OCPP request command name.
   * @param commandParams - Optional request payload.
   * @param params - Optional request behavior parameters.
   * @returns Response payload from the Central System.
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async requestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    commandParams?: ReqType,
    params?: RequestParams
  ): Promise<ResType> {
    logger.debug(
      `${chargingStation.logPrefix()} ${this.moduleName}.requestHandler: Processing '${commandName}' request`
    )
    if (isRequestCommandSupported(chargingStation, commandName)) {
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${this.moduleName}.requestHandler: Building request payload for '${commandName}'`
        )
        const requestPayload =
          params?.rawPayload === true
            ? (commandParams as ReqType)
            : this.buildRequestPayload(chargingStation, commandName, commandParams)
        const messageId = generateUUID()
        logger.debug(
          `${chargingStation.logPrefix()} ${this.moduleName}.requestHandler: Sending '${commandName}' request with message ID '${messageId}'`
        )
        await this.preRequestHook(chargingStation, commandName, commandParams)
        const response = (await this.sendMessage(
          chargingStation,
          messageId,
          requestPayload,
          commandName,
          params
        )) as ResType
        logger.debug(
          `${chargingStation.logPrefix()} ${this.moduleName}.requestHandler: '${commandName}' request completed successfully`
        )
        return response
      } catch (error) {
        this.logRequestHandlerError(chargingStation, commandName, error)
        throw error
      }
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    const errorMsg = `Unsupported OCPP command ${commandName}`
    logger.error(`${chargingStation.logPrefix()} ${this.moduleName}.requestHandler: ${errorMsg}`)
    throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
  }

  public async sendError (
    chargingStation: ChargingStation,
    messageId: string,
    ocppError: OCPPError,
    commandName: IncomingRequestCommand | RequestCommand
  ): Promise<ResponseType> {
    try {
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
        ensureError(error)
      )
      return null
    }
  }

  public async sendResponse (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: IncomingRequestCommand
  ): Promise<ResponseType> {
    try {
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
        ensureError(error),
        {
          throwError: true,
        }
      )
      return null
    }
  }

  protected abstract buildRequestPayload (
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    commandParams?: JsonType
  ): JsonType

  protected logRequestHandlerError (
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    error: unknown
  ): void {
    logger.error(
      `${chargingStation.logPrefix()} ${this.moduleName}.requestHandler: Error processing '${commandName}' request:`,
      error
    )
  }

  /**
   * Pre-request actions hook run after message id generation and before the
   * request is sent. Base implementation is a no-op; overridden per OCPP
   * version that needs a version-specific step (e.g. OCPP 1.6 StartTransaction).
   * @param _chargingStation - Target charging station.
   * @param _commandName - OCPP request command name.
   * @param _commandParams - Optional request payload.
   */
  protected preRequestHook (
    _chargingStation: ChargingStation,
    _commandName: RequestCommand,
    _commandParams?: JsonType
  ): Promise<void> | void {
    /* No-op by default */
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
        ensureError(error),
        {
          throwError: params.throwError,
        }
      )
      return null
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  protected validateIncomingRequestResponsePayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand | RequestCommand,
    payload: T
  ): boolean {
    return validatePayload(
      chargingStation,
      commandName,
      payload,
      this.ocppResponseService.incomingRequestResponsePayloadValidateFunctions.get(
        commandName as IncomingRequestCommand
      ),
      'incoming request response',
      true
    )
  }

  /**
   * Validates outgoing request payload against JSON schema
   * @param chargingStation - The charging station instance sending the request
   * @param commandName - OCPP command name to validate against
   * @param payload - JSON payload to validate
   * @returns `true` when payload validation succeeds; `false` otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  protected validateRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand | RequestCommand,
    payload: T
  ): boolean {
    return validatePayload(
      chargingStation,
      commandName,
      payload,
      this.payloadValidatorFunctions.get(commandName as RequestCommand),
      'request',
      true
    )
  }

  private buildMessageToSend (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: IncomingRequestCommand | RequestCommand
  ): string {
    let messageToSend: string
    // Type of message
    switch (messageType) {
      // Error Message
      case MessageType.CALL_ERROR_MESSAGE: {
        // Build Error Message per OCPP-J §4.2.3: [4, messageId, errorCode, errorDescription, errorDetails]
        const ocppError =
          messagePayload instanceof OCPPError
            ? messagePayload
            : new OCPPError(ErrorType.INTERNAL_ERROR, getErrorMessage(messagePayload), commandName)
        messageToSend = JSON.stringify([
          messageType,
          messageId,
          ocppError.code,
          ocppError.message,
          ocppError.details ?? {
            command: ocppError.command,
          },
        ] satisfies ErrorResponse)
        break
      }
      // Request
      case MessageType.CALL_MESSAGE:
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
    }
    return messageToSend
  }

  private async internalSendMessage (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: IncomingRequestCommand | RequestCommand,
    params?: RequestParams
  ): Promise<ResponseType> {
    params = {
      ...defaultRequestParams,
      ...params,
    }
    if (
      ((chargingStation.inUnknownState() ||
        chargingStation.inPendingState() ||
        chargingStation.inRejectedState()) &&
        commandName === RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState()) ||
      chargingStation.inAcceptedState() ||
      (chargingStation.inPendingState() &&
        (params.triggerMessage === true || messageType === MessageType.CALL_RESULT_MESSAGE))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- stable outer-this reference captured for nested Promise executor and its response-handler closures
      const self = this
      return await new Promise<ResponseType>((resolve, reject: (reason?: unknown) => void) => {
        /**
         * Function that will receive the request's response
         * @param payload - The response payload
         * @param requestPayload - The original request payload
         */
        const responseCallback = (payload: JsonType, requestPayload: JsonType): void => {
          chargingStation.recordRequestStatistic(commandName, MessageType.CALL_RESULT_MESSAGE)
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
              chargingStation.emitChargingStationEvent(ChargingStationEvents.updated)
            })
            .catch(reject)
        }

        /**
         * Function that will receive the request's error response
         * @param ocppError - The OCPP error response
         * @param requestStatistic - Whether to record request statistics
         */
        const errorCallback = (ocppError: OCPPError, requestStatistic = true): void => {
          if (requestStatistic) {
            chargingStation.recordRequestStatistic(commandName, MessageType.CALL_ERROR_MESSAGE)
          }
          logger.error(
            `${chargingStation.logPrefix()} Error occurred at ${getMessageTypeString(
              messageType
            )} command ${commandName} with PDU %j:`,
            messagePayload,
            ocppError
          )
          chargingStation.requests.delete(messageId)
          chargingStation.emitChargingStationEvent(ChargingStationEvents.updated)
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
            chargingStation.requests.delete(messageId)
          }
          reject(ocppError)
        }

        chargingStation.recordRequestStatistic(commandName, messageType)
        const messageToSend = this.buildMessageToSend(
          chargingStation,
          messageId,
          messagePayload,
          messageType,
          commandName
        )
        if (chargingStation.isWebSocketConnectionOpened()) {
          const beginId = PerformanceStatistics.beginMeasure(commandName)
          const sendTimeout = setTimeout(() => {
            handleSendError(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `Timeout ${formatDurationMilliSeconds(
                  OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS
                )} reached for ${
                  params.skipBufferingOnError === false ? '' : 'non '
                }buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                messagePayload instanceof OCPPError ? messagePayload.details : undefined
              )
            )
          }, OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS)
          chargingStation.wsConnection?.send(messageToSend, (error?: Error) => {
            PerformanceStatistics.endMeasure(commandName, beginId)
            clearTimeout(sendTimeout)
            if (error == null) {
              logger.debug(
                `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: >> Command '${commandName}' sent ${getMessageTypeString(
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
                    message: error.message,
                    name: error.name,
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
              messagePayload instanceof OCPPError ? messagePayload.details : undefined
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

  private setCachedRequest (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: IncomingRequestCommand | RequestCommand,
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
}
