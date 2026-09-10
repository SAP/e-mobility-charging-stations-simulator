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
  type PendingRequestCancellationCallback,
  RequestCommand,
  type RequestParams,
  type Response,
  type ResponseCallback,
  type ResponseType,
} from '../../types/index.js'
import {
  clampToSafeTimerValue,
  Constants,
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

interface OutgoingCallCancellationState {
  readonly destructiveError: OCPPError | undefined
  readonly destructiveGeneration: number
  readonly generation: number
  readonly latestError: OCPPError
}

interface OutgoingCallGate {
  activeDeadline?: number
  activeMessageId?: string
  readonly waiters: OutgoingCallWaiter[]
}

interface OutgoingCallWaiter {
  readonly messageId: string
  readonly reject: (reason: OCPPError) => void
  readonly resolve: () => void
  readonly retainOnCancellation?: () => boolean
  readonly slotTimeoutMs: number
}

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
  private readonly outgoingCallCancellationStates = new WeakMap<
    ChargingStation,
    OutgoingCallCancellationState
  >()

  private readonly outgoingCallGates = new WeakMap<ChargingStation, OutgoingCallGate>()
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
   * Acquires the station-wide FIFO slot for one outgoing CALL. CALLRESULT and
   * CALLERROR frames never use this gate.
   * @param chargingStation - Station that owns the OCPP-J connection
   * @param messageId - Correlation id of the outgoing CALL
   * @param timeoutMs - Maximum duration of this CALL slot
   * @param retainOnCancellation - Optional predicate deciding whether lifecycle cancellation
   * preserves this CALL
   */
  public async acquireOutgoingCall (
    chargingStation: ChargingStation,
    messageId: string,
    timeoutMs: number,
    retainOnCancellation?: () => boolean
  ): Promise<void> {
    let gate = this.outgoingCallGates.get(chargingStation)
    if (gate == null) {
      gate = { waiters: [] }
      this.outgoingCallGates.set(chargingStation, gate)
    }
    const boundedSlotTimeoutMs = clampToSafeTimerValue(timeoutMs)
    if (gate.activeMessageId == null) {
      gate.activeMessageId = messageId
      gate.activeDeadline = Date.now() + boundedSlotTimeoutMs
      return
    }
    if (gate.waiters.length >= Constants.MAX_OUTGOING_CALL_WAITERS) {
      throw new OCPPError(
        ErrorType.GENERIC_ERROR,
        `Outgoing CALL gate waiter limit of ${Constants.MAX_OUTGOING_CALL_WAITERS.toString()} reached for message id '${messageId}'`
      )
    }
    await new Promise<void>((resolve, reject: (reason: OCPPError) => void) => {
      let waiterTimeout: NodeJS.Timeout | undefined
      const clearWaiterTimeout = (): void => {
        if (waiterTimeout != null) {
          clearTimeout(waiterTimeout)
          waiterTimeout = undefined
        }
      }
      const maximumTimerValue = clampToSafeTimerValue(Number.MAX_SAFE_INTEGER)
      const addBudget = (totalMs: number, slotTimeoutMs: number): number =>
        totalMs > maximumTimerValue - slotTimeoutMs ? maximumTimerValue : totalMs + slotTimeoutMs
      const now = Date.now()
      let waiterTimeoutMs = Math.max(0, (gate.activeDeadline ?? now) - now)
      for (const waiter of gate.waiters) {
        waiterTimeoutMs = addBudget(waiterTimeoutMs, waiter.slotTimeoutMs)
      }
      waiterTimeoutMs = addBudget(waiterTimeoutMs, boundedSlotTimeoutMs)
      const waiter: OutgoingCallWaiter = {
        messageId,
        reject: reason => {
          clearWaiterTimeout()
          reject(reason)
        },
        resolve: () => {
          clearWaiterTimeout()
          resolve()
        },
        retainOnCancellation,
        slotTimeoutMs: boundedSlotTimeoutMs,
      }
      gate.waiters.push(waiter)
      waiterTimeout = setTimeout(() => {
        const waiterIndex = gate.waiters.indexOf(waiter)
        if (waiterIndex < 0) return
        gate.waiters.splice(waiterIndex, 1)
        waiter.reject(
          new OCPPError(
            ErrorType.GENERIC_ERROR,
            `Timeout ${formatDurationMilliSeconds(waiterTimeoutMs)} waiting to acquire the outgoing CALL gate for message id '${messageId}'`
          )
        )
      }, waiterTimeoutMs)
    })
  }

  /**
   * Cancels one queued outgoing CALL without disturbing the active CALL.
   * @param chargingStation - Station that owns the OCPP-J connection
   * @param messageId - Correlation id of the queued CALL
   * @param error - Typed cancellation delivered to the waiter
   * @returns Whether a matching queued waiter was cancelled
   */
  public cancelOutgoingCallWaiter (
    chargingStation: ChargingStation,
    messageId: string,
    error: OCPPError
  ): boolean {
    const gate = this.outgoingCallGates.get(chargingStation)
    if (gate == null || gate.activeMessageId === messageId) return false
    const waiterIndex = gate.waiters.findIndex(waiter => waiter.messageId === messageId)
    if (waiterIndex < 0) return false
    const [waiter] = gate.waiters.splice(waiterIndex, 1)
    waiter.reject(error)
    return true
  }

  /**
   * Rejects pending requests so their response timers and captured station
   * state are released when the station stops. Buffered CALLs remain registered
   * for replay, and explicitly retained graceful-stop CALLs keep awaiting their
   * response, unless final shutdown or permanent deletion cancels them.
   * @param chargingStation - Station whose pending requests are cancelled
   * @param message - Error message delivered to pending callers
   * @param discardBufferedRequests - Whether deferred CALL frames and callbacks are discarded
   * @param options - Cancellation behavior for queued and in-flight transport sends
   * @param options.bufferInFlightSends - Settle in-flight sends through their normal buffer policy
   * @param options.preserveRetainableWaiters - Keep queued CALLs whose request policy permits replay
   */
  public cancelPendingRequests (
    chargingStation: ChargingStation,
    message = 'Charging station stopped while awaiting an OCPP response',
    discardBufferedRequests = false,
    {
      bufferInFlightSends = false,
      preserveRetainableWaiters = !discardBufferedRequests && !bufferInFlightSends,
    }: { bufferInFlightSends?: boolean; preserveRetainableWaiters?: boolean } = {}
  ): void {
    const cancellationError = new OCPPError(ErrorType.GENERIC_ERROR, message)
    const previousCancellationState = this.outgoingCallCancellationStates.get(chargingStation)
    const cancellationGeneration = (previousCancellationState?.generation ?? 0) + 1
    this.outgoingCallCancellationStates.set(chargingStation, {
      destructiveError: discardBufferedRequests
        ? cancellationError
        : previousCancellationState?.destructiveError,
      destructiveGeneration: discardBufferedRequests
        ? cancellationGeneration
        : (previousCancellationState?.destructiveGeneration ?? 0),
      generation: cancellationGeneration,
      latestError: cancellationError,
    })
    this.cancelOutgoingCallWaiters(chargingStation, cancellationError, preserveRetainableWaiters)
    const bufferedRequestIds = discardBufferedRequests
      ? undefined
      : chargingStation.getBufferedRequestIds()
    // Clear buffered frames before invoking callbacks. Their terminal cleanup
    // can then remain idempotent without repeatedly scanning a shrinking queue.
    if (discardBufferedRequests) chargingStation.clearMessageBuffer()
    for (const [messageId, [, errorCallback, , , cancelPendingSend]] of [
      ...chargingStation.requests.entries(),
    ]) {
      if (bufferedRequestIds?.has(messageId) === true) {
        // A replay already in flight must stay queued and stop the active drain;
        // a merely queued CALL is retained without changing its position.
        chargingStation.retainBufferedRequest(messageId)
        cancelPendingSend?.(cancellationError)
        this.releaseOutgoingCall(chargingStation, messageId)
        continue
      }
      // Preserve shutdown-critical CALLs before their send timers and initiating promises are settled.
      if (
        !discardBufferedRequests &&
        cancelPendingSend?.(cancellationError, bufferInFlightSends) === true
      ) {
        continue
      }
      chargingStation.requests.delete(messageId)
      errorCallback(cancellationError, false)
    }
  }

  /**
   * Releases an outgoing CALL slot after its terminal transport outcome.
   * @param chargingStation - Station that owns the OCPP-J connection
   * @param messageId - Correlation id of the completed CALL
   */
  public releaseOutgoingCall (chargingStation: ChargingStation, messageId: string): void {
    const gate = this.outgoingCallGates.get(chargingStation)
    if (gate?.activeMessageId !== messageId) return
    const next = gate.waiters.shift()
    if (next == null) {
      this.outgoingCallGates.delete(chargingStation)
      return
    }
    gate.activeMessageId = next.messageId
    gate.activeDeadline = Date.now() + next.slotTimeoutMs
    next.resolve()
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
    const cancellationGenerationAtRequestStart =
      this.outgoingCallCancellationStates.get(chargingStation)?.generation ?? 0
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
          params,
          cancellationGenerationAtRequestStart
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

  /**
   * Validates outgoing request payload against JSON schema
   * @param chargingStation - The charging station instance sending the request
   * @param commandName - OCPP command name to validate against
   * @param payload - JSON payload to validate
   * @returns `true` when payload validation succeeds; `false` otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public validateRequestPayload<T extends JsonType>(
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

  protected abstract buildRequestPayload (
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    commandParams?: JsonType
  ): JsonType

  protected abstract getDefaultResponseTimeoutMs (chargingStation: ChargingStation): number

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
    params?: RequestParams,
    cancellationGenerationAtRequestStart?: number
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
        params,
        cancellationGenerationAtRequestStart
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

  /**
   * Cancels non-retained CALLs waiting behind the active station request during lifecycle teardown.
   * @param chargingStation - Station whose queued CALLs are cancelled
   * @param error - Typed cancellation delivered to each waiter
   * @param preserveRetainableWaiters - Whether graceful-stop CALLs remain queued
   */
  private cancelOutgoingCallWaiters (
    chargingStation: ChargingStation,
    error: OCPPError,
    preserveRetainableWaiters: boolean
  ): void {
    const gate = this.outgoingCallGates.get(chargingStation)
    if (gate == null) return
    const waiters = gate.waiters.splice(0)
    for (const waiter of waiters) {
      if (!preserveRetainableWaiters || waiter.retainOnCancellation?.() !== true) {
        waiter.reject(error)
      } else {
        gate.waiters.push(waiter)
      }
    }
    if (gate.activeMessageId == null && gate.waiters.length === 0) {
      this.outgoingCallGates.delete(chargingStation)
    }
  }

  private async internalSendMessage (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType | OCPPError,
    messageType: MessageType,
    commandName: IncomingRequestCommand | RequestCommand,
    params?: RequestParams,
    cancellationGenerationAtRequestStart?: number
  ): Promise<ResponseType> {
    params = {
      ...defaultRequestParams,
      ...params,
    }
    const responseTimeoutMs =
      params.responseTimeoutMs != null && params.responseTimeoutMs > 0
        ? params.responseTimeoutMs
        : this.getDefaultResponseTimeoutMs(chargingStation)
    const canSendMessage = (): boolean =>
      ((chargingStation.inUnknownState() ||
        chargingStation.inPendingState() ||
        chargingStation.inRejectedState()) &&
        commandName === RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState()) ||
      chargingStation.inAcceptedState() ||
      (chargingStation.inPendingState() &&
        (params.triggerMessage === true || messageType === MessageType.CALL_RESULT_MESSAGE))
    const buildInvalidStateError = (): OCPPError =>
      new OCPPError(
        ErrorType.SECURITY_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot send command ${commandName} PDU when the charging station is in ${chargingStation.bootNotificationResponse?.status} state on the central server`,
        commandName
      )
    if (canSendMessage()) {
      if (messageType === MessageType.CALL_MESSAGE) {
        const cancellationStateAtStart = this.outgoingCallCancellationStates.get(chargingStation)
        if (cancellationStateAtStart?.destructiveError != null) {
          try {
            params.onTransportError?.(cancellationStateAtStart.destructiveError, false)
          } catch (callbackError: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onTransportError callback failed after permanent cancellation for message id '${messageId}':`,
              callbackError
            )
          }
          throw cancellationStateAtStart.destructiveError
        }
        const cancellationGeneration =
          cancellationGenerationAtRequestStart ?? cancellationStateAtStart?.generation ?? 0
        const retainOnCancellation = (): boolean =>
          chargingStation.isStopping()
            ? params.bufferOnErrorDuringStationStop === true ||
              params.waitForResponseOnStationStop === true
            : params.skipBufferingOnError === false
        try {
          await this.acquireOutgoingCall(
            chargingStation,
            messageId,
            clampToSafeTimerValue(
              clampToSafeTimerValue(OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS) +
                clampToSafeTimerValue(responseTimeoutMs)
            ),
            retainOnCancellation
          )
        } catch (error: unknown) {
          const transportError =
            error instanceof OCPPError
              ? error
              : new OCPPError(ErrorType.GENERIC_ERROR, getErrorMessage(error), commandName)
          try {
            params.onTransportError?.(transportError, false)
          } catch (callbackError: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onTransportError callback failed while waiting for the outgoing CALL gate for message id '${messageId}':`,
              callbackError
            )
          }
          throw error
        }
        const cancellationState = this.outgoingCallCancellationStates.get(chargingStation)
        const destructiveCancellation =
          cancellationState != null &&
          cancellationState.destructiveGeneration > cancellationGeneration
        if (
          cancellationState != null &&
          (destructiveCancellation ||
            (cancellationState.generation > cancellationGeneration && !retainOnCancellation()))
        ) {
          this.releaseOutgoingCall(chargingStation, messageId)
          const cancellationError = destructiveCancellation
            ? (cancellationState.destructiveError ?? cancellationState.latestError)
            : cancellationState.latestError
          try {
            params.onTransportError?.(cancellationError, false)
          } catch (callbackError: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onTransportError callback failed after cancellation before transport send for message id '${messageId}':`,
              callbackError
            )
          }
          throw cancellationError
        }
        if (!canSendMessage()) {
          this.releaseOutgoingCall(chargingStation, messageId)
          throw buildInvalidStateError()
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- stable outer-this reference captured for nested Promise executor and its response-handler closures
      const self = this
      return await new Promise<ResponseType>((resolve, reject: (reason?: unknown) => void) => {
        let responseTimeout: NodeJS.Timeout | undefined
        let sendTimeout: NodeJS.Timeout | undefined
        let bufferedMessage: string | undefined
        let sendErrorHandled = false
        let sendErrorBuffered = false
        let terminalResponseHandled = false
        const clearResponseTimeout = (): void => {
          if (responseTimeout != null) {
            clearTimeout(responseTimeout)
            responseTimeout = undefined
          }
        }
        const clearSendTimeout = (): void => {
          if (sendTimeout != null) {
            clearTimeout(sendTimeout)
            sendTimeout = undefined
          }
        }
        const prepareTerminalResponse = (): boolean => {
          if (terminalResponseHandled) return false
          terminalResponseHandled = true
          if (messageType === MessageType.CALL_MESSAGE) {
            self.releaseOutgoingCall(chargingStation, messageId)
          }
          clearResponseTimeout()
          clearSendTimeout()
          if (bufferedMessage != null) {
            chargingStation.removeBufferedMessage(bufferedMessage)
            bufferedMessage = undefined
          }
          return true
        }

        /**
         * Function that will receive the request's response
         * @param payload - The response payload
         * @param requestPayload - The original request payload
         */
        const responseCallback = (payload: JsonType, requestPayload: JsonType): void => {
          if (!prepareTerminalResponse()) return
          chargingStation.recordRequestStatistic(commandName, MessageType.CALL_RESULT_MESSAGE)
          try {
            params.onResponseReceived?.()
          } catch (error: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onResponseReceived callback failed for message id '${messageId}':`,
              error
            )
          }
          // The wire response has arrived: remove the correlation entry before
          // asynchronous response-side effects so lifecycle cancellation cannot
          // reject an already-answered request while its handler is still running.
          chargingStation.requests.delete(messageId)
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
          if (!prepareTerminalResponse()) return
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
          try {
            params.onError?.(ocppError, requestStatistic)
          } catch (error: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onError callback failed for message id '${messageId}':`,
              error
            )
          }
          chargingStation.emitChargingStationEvent(ChargingStationEvents.updated)
          reject(ocppError)
        }

        const shouldBufferOnError = (): boolean =>
          params.skipBufferingOnError === false ||
          (params.bufferOnErrorDuringStationStop === true && chargingStation.isStopping())
        const notifyMessageSent = (): void => {
          clearResponseTimeout()
          if (messageType === MessageType.CALL_MESSAGE) {
            responseTimeout = setTimeout(() => {
              errorCallback(
                new OCPPError(
                  ErrorType.GENERIC_ERROR,
                  `Timeout ${formatDurationMilliSeconds(responseTimeoutMs)} waiting for response to message id '${messageId}'`,
                  commandName,
                  messagePayload instanceof OCPPError ? messagePayload.details : undefined
                ),
                false
              )
            }, responseTimeoutMs)
          }
          try {
            params.onMessageSent?.()
          } catch (error: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onMessageSent callback failed for message id '${messageId}':`,
              error
            )
          }
        }
        const notifyRequestBuffered = (): void => {
          try {
            params.onRequestBuffered?.()
          } catch (error: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onRequestBuffered callback failed for message id '${messageId}':`,
              error
            )
          }
        }
        const notifyTransportError = (ocppError: OCPPError, deliveryAmbiguous: boolean): void => {
          try {
            params.onTransportError?.(ocppError, deliveryAmbiguous)
          } catch (error: unknown) {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: onTransportError callback failed for message id '${messageId}':`,
              error
            )
          }
        }
        const handleSendError = (
          ocppError: OCPPError,
          deliveryAmbiguous: boolean,
          forceBuffer = false
        ): boolean => {
          if (sendErrorHandled) return sendErrorBuffered
          sendErrorHandled = true
          if (messageType === MessageType.CALL_MESSAGE) {
            self.releaseOutgoingCall(chargingStation, messageId)
            notifyTransportError(ocppError, deliveryAmbiguous)
            if (terminalResponseHandled) {
              clearResponseTimeout()
              clearSendTimeout()
              return false
            }
            if (sendErrorBuffered) {
              clearResponseTimeout()
              clearSendTimeout()
              return true
            }
          }
          clearResponseTimeout()
          clearSendTimeout()
          if (forceBuffer || shouldBufferOnError()) {
            bufferedMessage = messageToSend
            chargingStation.bufferMessage(messageToSend)
            sendErrorBuffered = true
            notifyRequestBuffered()
            if (messageType === MessageType.CALL_MESSAGE) {
              this.setCachedRequest(
                chargingStation,
                messageId,
                messagePayload as JsonType,
                commandName,
                responseCallback,
                errorCallback,
                cancelPendingSend,
                notifyMessageSent,
                clearResponseTimeout,
                responseTimeoutMs
              )
            }
          } else if (messageType === MessageType.CALL_MESSAGE) {
            chargingStation.requests.delete(messageId)
          }
          reject(ocppError)
          return sendErrorBuffered
        }
        const forceBufferPendingRequest = (ocppError: OCPPError): boolean => {
          if (!sendErrorHandled) return handleSendError(ocppError, false, true)
          if (terminalResponseHandled) return false
          self.releaseOutgoingCall(chargingStation, messageId)
          clearResponseTimeout()
          clearSendTimeout()
          if (bufferedMessage == null || !chargingStation.retainBufferedMessage(bufferedMessage)) {
            const wasBuffered = bufferedMessage != null
            bufferedMessage = messageToSend
            chargingStation.bufferMessage(messageToSend, wasBuffered)
          }
          if (!sendErrorBuffered) notifyRequestBuffered()
          sendErrorBuffered = true
          reject(ocppError)
          return true
        }

        const cancelPendingSend: PendingRequestCancellationCallback | undefined =
          messageType === MessageType.CALL_MESSAGE
            ? (ocppError, handleInFlightSend = false) => {
                if (params.waitForResponseOnStationStop === true) {
                  if (!handleInFlightSend) return true
                  errorCallback(ocppError, false)
                  return true
                }
                if (handleInFlightSend && !sendErrorHandled) {
                  handleSendError(ocppError, true, false)
                  return true
                }
                return params.bufferOnErrorDuringStationStop === true
                  ? forceBufferPendingRequest(ocppError)
                  : false
              }
            : undefined
        chargingStation.recordRequestStatistic(commandName, messageType)
        const messageToSend = this.buildMessageToSend(
          chargingStation,
          messageId,
          messagePayload,
          messageType,
          commandName
        )
        if (messageType === MessageType.CALL_MESSAGE) {
          this.setCachedRequest(
            chargingStation,
            messageId,
            messagePayload as JsonType,
            commandName,
            responseCallback,
            errorCallback,
            cancelPendingSend,
            notifyMessageSent,
            clearResponseTimeout,
            responseTimeoutMs
          )
          if (params.bufferWithoutSending === true) {
            handleSendError(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `Buffered message id '${messageId}' without sending`,
                commandName,
                messagePayload instanceof OCPPError ? messagePayload.details : undefined
              ),
              false,
              true
            )
            return
          }
        }
        if (chargingStation.isWebSocketConnectionOpened()) {
          const beginId = PerformanceStatistics.beginMeasure(commandName)
          sendTimeout = setTimeout(() => {
            handleSendError(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `Timeout ${formatDurationMilliSeconds(
                  OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS
                )} reached for ${
                  shouldBufferOnError() ? '' : 'non '
                }buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                messagePayload instanceof OCPPError ? messagePayload.details : undefined
              ),
              true
            )
          }, OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS)
          try {
            chargingStation.wsConnection?.send(messageToSend, (error?: Error) => {
              PerformanceStatistics.endMeasure(commandName, beginId)
              clearSendTimeout()
              if (sendErrorHandled) return
              if (
                messageType === MessageType.CALL_MESSAGE &&
                !chargingStation.requests.has(messageId)
              ) {
                return
              }
              if (error == null) {
                sendErrorHandled = true
                if (messageType === MessageType.CALL_MESSAGE) {
                  this.setCachedRequest(
                    chargingStation,
                    messageId,
                    messagePayload as JsonType,
                    commandName,
                    responseCallback,
                    errorCallback,
                    cancelPendingSend,
                    notifyMessageSent,
                    clearResponseTimeout,
                    responseTimeoutMs
                  )
                }
                logger.debug(
                  `${chargingStation.logPrefix()} ${moduleName}.internalSendMessage: >> Command '${commandName}' sent ${getMessageTypeString(
                    messageType
                  )} payload: ${messageToSend}`
                )
                if (messageType === MessageType.CALL_MESSAGE) {
                  notifyMessageSent()
                } else {
                  // Resolve response
                  resolve(messagePayload)
                  notifyMessageSent()
                }
              } else {
                handleSendError(
                  new OCPPError(
                    ErrorType.GENERIC_ERROR,
                    `WebSocket errored for ${
                      shouldBufferOnError() ? '' : 'non '
                    }buffered message id '${messageId}' with content '${messageToSend}'`,
                    commandName,
                    {
                      message: error.message,
                      name: error.name,
                      stack: error.stack,
                    }
                  ),
                  true
                )
              }
            })
          } catch (error: unknown) {
            PerformanceStatistics.endMeasure(commandName, beginId)
            clearSendTimeout()
            const sendError = ensureError(error)
            handleSendError(
              new OCPPError(
                ErrorType.GENERIC_ERROR,
                `WebSocket errored for ${
                  shouldBufferOnError() ? '' : 'non '
                }buffered message id '${messageId}' with content '${messageToSend}'`,
                commandName,
                {
                  message: sendError.message,
                  name: sendError.name,
                  stack: sendError.stack,
                }
              ),
              false
            )
          }
        } else {
          handleSendError(
            new OCPPError(
              ErrorType.GENERIC_ERROR,
              `WebSocket closed for ${
                shouldBufferOnError() ? '' : 'non '
              }buffered message id '${messageId}' with content '${messageToSend}'`,
              commandName,
              messagePayload instanceof OCPPError ? messagePayload.details : undefined
            ),
            false
          )
        }
      }).finally(() => {
        if (messageType === MessageType.CALL_MESSAGE) {
          this.releaseOutgoingCall(chargingStation, messageId)
        }
      })
    }
    throw buildInvalidStateError()
  }

  private setCachedRequest (
    chargingStation: ChargingStation,
    messageId: string,
    messagePayload: JsonType,
    commandName: IncomingRequestCommand | RequestCommand,
    responseCallback: ResponseCallback,
    errorCallback: ErrorCallback,
    cancelPendingSend?: PendingRequestCancellationCallback,
    onMessageSent?: () => void,
    onTransportLost?: () => void,
    responseTimeoutMs?: number
  ): void {
    chargingStation.requests.set(messageId, [
      responseCallback,
      errorCallback,
      commandName,
      messagePayload,
      cancelPendingSend,
      onMessageSent,
      onTransportLost,
      responseTimeoutMs,
    ])
  }
}
