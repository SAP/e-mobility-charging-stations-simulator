import type { ValidateFunction } from 'ajv'

import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'

import { type ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import {
  type ConfigurationStatus,
  ErrorType,
  type IncomingRequestCommand,
  type IncomingRequestHandler,
  type JsonType,
  type OCPPVersion,
} from '../../types/index.js'
import { isAsyncFunction, JSONStringify, logger } from '../../utils/index.js'
import { type Ajv, createAjv, validatePayload } from './OCPPServiceUtils.js'

/**
 * OCPP incoming-request service base class.
 *
 * Provides shared plumbing for per-station lifecycle state:
 * - a protected {@link WeakMap} keyed by {@link ChargingStation};
 * - a lazy-init getter (`getOrCreateStationState`) that returns the
 *   sealed stopped state instead of resurrecting a fresh entry after
 *   {@link stop};
 * - explicit {@link activate} replacement before a new socket lifecycle;
 * - admission-scoped state that keeps late callbacks on their original entry;
 * - a concrete `stop()` template that resets and marks the entry
 *   `stopped: true`, preserving the WeakMap entry until activation.
 *
 * Subclass contract:
 * - `createStationState` — factory returning the initial state object.
 * - `resetStationState` — releases any resources held by the state
 *   (abort controllers, timer handles, retry managers).
 *
 * The `stop()` template owns the ordering invariant (reset before mark)
 * and the "only-if-present" guard. Subclasses that need additional
 * lifecycle cleanup should override `stop()` and call `super.stop()`
 * first; override `resetStationState` (not `stop()`) for state-field
 * reset logic.
 * @template TStationState - Concrete per-station state shape.
 * The default `{ stopped?: boolean }` bound is load-bearing: the bare
 * `OCPPIncomingRequestService` reference in the static singleton
 * registry ({@link OCPPIncomingRequestService.instances}) and the
 * `getInstance<T extends OCPPIncomingRequestService>` constraint
 * resolve to `OCPPIncomingRequestService<{ stopped?: boolean }>`;
 * removing the default breaks both with `TS2314`. The bound also
 * matches the `WeakMap` value-type requirement (values must be
 * non-primitive) and carries the marker field consumed by {@link stop}
 * and {@link getOrCreateStationState}.
 */
export abstract class OCPPIncomingRequestService<
  TStationState extends { stopped?: boolean } = { stopped?: boolean }
> extends EventEmitter {
  private static readonly instances = new Map<
    new () => OCPPIncomingRequestService,
    OCPPIncomingRequestService
  >()

  protected readonly ajv: Ajv
  protected abstract readonly csmsName: string
  protected abstract readonly incomingRequestHandlers: Map<
    IncomingRequestCommand,
    IncomingRequestHandler
  >

  protected abstract readonly moduleName: string

  protected abstract payloadValidatorFunctions: Map<
    IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected abstract readonly pendingStateBlockedCommands: IncomingRequestCommand[]
  /**
   * Per-station lifecycle state.
   *
   * INVARIANT: single **lifecycle-state** `WeakMap<ChargingStation, TStationState>`
   * declaration in the codebase. A sibling module-scope diagnostic
   * `WeakMap<ChargingStation, Set<string>>` (`warnedInvalidMeasurands`) at
   * `OCPPServiceUtils.ts` is intentionally scoped separately — that is a
   * warn-once side-effect cache with no lifecycle semantics, a different
   * pattern. Subclasses MUST NOT redeclare this field: TypeScript field
   * re-declaration with an initializer at the subclass level creates a
   * distinct backing slot at construction, silently splitting state
   * between the subclass shadow and the base template (which resolves
   * against the base declaration). Subclasses MUST also defer all
   * mutations of `this.stationsState` to {@link getOrCreateStationState}
   * and the base {@link stop} template — no direct `.set`, `.delete`, or
   * `.clear` from anywhere outside this file (enforced by the
   * `no-restricted-syntax` ESLint rule).
   */
  protected readonly stationsState = new WeakMap<ChargingStation, TStationState>()
  private readonly stationStateContext = new AsyncLocalStorage<{
    chargingStation: ChargingStation
    messageLifecycleIsCurrent: () => boolean
    messageLifecycleSignal: AbortSignal
    messageSourceIsCurrent: () => boolean
    stationState: TStationState
  }>()

  private readonly version: OCPPVersion

  protected constructor (version: OCPPVersion) {
    super()
    this.version = version
    this.ajv = createAjv()
    this.incomingRequestHandler = this.incomingRequestHandler.bind(this)
    this.stop = this.stop.bind(this)
    this.validateIncomingRequestPayload = this.validateIncomingRequestPayload.bind(this)
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new () => T): T {
    if (!OCPPIncomingRequestService.instances.has(this)) {
      OCPPIncomingRequestService.instances.set(this, new this())
    }
    return OCPPIncomingRequestService.instances.get(this) as T
  }

  /**
   * Applies a configuration change from a trusted local caller (e.g. the Web UI),
   * reusing the version-specific incoming-request spec logic (readonly rejection,
   * value validation, side-effect restarts, reboot signalling) WITHOUT emitting an
   * OCPP response to the CSMS.
   * @param chargingStation - Target charging station.
   * @param key - Configuration key name.
   * @param value - New value to apply.
   * @returns The resulting {@link ConfigurationStatus}.
   */
  public abstract changeConfiguration (
    chargingStation: ChargingStation,
    key: string,
    value: string
  ): ConfigurationStatus

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters, @typescript-eslint/no-unused-vars
  public incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: ReqType,
    messageLifecycleSignal: AbortSignal = chargingStation.lifecycleAbortSignal,
    messageLifecycleIsCurrent: () => boolean = () =>
      chargingStation.lifecycleAbortSignal === messageLifecycleSignal &&
      !messageLifecycleSignal.aborted,
    messageSourceIsCurrent: () => boolean = () => true
  ): Promise<void> {
    const stationState = this.getOrCreateCurrentStationState(chargingStation)
    return this.stationStateContext.run(
      {
        chargingStation,
        messageLifecycleIsCurrent,
        messageLifecycleSignal,
        messageSourceIsCurrent,
        stationState,
      },
      async () => {
        await this.handleIncomingRequest(
          chargingStation,
          messageId,
          commandName,
          commandPayload,
          messageLifecycleSignal,
          messageLifecycleIsCurrent,
          messageSourceIsCurrent,
          stationState
        )
      }
    )
  }

  /**
   * Stops the incoming-request service for the given charging station.
   *
   * Template method: subclasses SHOULD NOT override the template steps
   * (WeakMap lookup, reset, mark stopped) — override
   * {@link resetStationState} for field-level cleanup. Subclasses MAY
   * override to add lifecycle-scoped side effects (e.g. clearing
   * external caches keyed on the station); such overrides MUST call
   * `super.stop()` first so the reset-then-mark ordering is preserved.
   *
   * The WeakMap entry is NOT deleted — it is marked `stopped: true`
   * after {@link resetStationState} releases its resources and remains
   * sealed until {@link activate} installs the next lifecycle entry.
   * Deletion would re-enable resurrection via
   * {@link getOrCreateStationState} lazy-init on any late handler
   * dispatch. Keeping the sealed entry lets
   * {@link getOrCreateStationState} return the sealed state and
   * `stationsState.get(cs)` null-guarded callers observe the marker
   * and drop. The WeakMap entry is naturally collected when the
   * {@link ChargingStation} reference is dropped.
   *
   * Exception behavior: if {@link resetStationState} throws, the
   * `stopped` mark is NOT set and a subsequent `stop()` re-invokes the
   * hook on the same state. Any subclass extension after `super.stop()`
   * is also skipped, as the throw propagates.
   * @param chargingStation - Target charging station.
   */
  public stop (chargingStation: ChargingStation): void {
    const stationState = this.stationsState.get(chargingStation)
    if (stationState != null) {
      this.resetStationState(stationState)
      stationState.stopped = true
    }
  }

  /**
   * Installs fresh request-service state for a new station lifecycle.
   * @param chargingStation - Target charging station
   * @param lifecycleSignal - Lifecycle being activated
   */
  // eslint-disable-next-line perfectionist/sort-classes
  public activate (chargingStation: ChargingStation, lifecycleSignal: AbortSignal): void {
    if (
      chargingStation.lifecycleAbortSignal !== lifecycleSignal ||
      lifecycleSignal.aborted ||
      chargingStation.isStopping()
    ) {
      return
    }
    const previousState = this.stationsState.get(chargingStation)
    if (previousState != null && previousState.stopped !== true) {
      this.resetStationState(previousState)
      previousState.stopped = true
    }
    this.stationsState.set(chargingStation, this.createStationState())
  }

  /**
   * Hook method: creates the initial per-station state, called on first
   * access via {@link getOrCreateStationState}.
   * @returns A fresh state object with default field values.
   */
  protected abstract createStationState (): TStationState

  protected getOrCreateStationState (chargingStation: ChargingStation): TStationState {
    const contextualState = this.getContextualStationState(chargingStation)
    if (contextualState != null) return contextualState
    let state = this.stationsState.get(chargingStation)
    if (state?.stopped === true) return state
    if (state == null) {
      state = this.createStationState()
      this.stationsState.set(chargingStation, state)
    }
    return state
  }

  /**
   * Returns serialized bytes retained by subclass-owned delivery reservations
   * that remain reachable through a buffered response callback.
   * @param _commandName - Incoming request command owning the reservation.
   * @param _commandPayload - Incoming request payload used as the reservation key.
   * @returns Additional per-response retained bytes.
   */
  protected getResponseDeliveryRetainedBytes (
    _commandName: IncomingRequestCommand,
    _commandPayload: JsonType
  ): number {
    return 0
  }

  protected getStationState (chargingStation: ChargingStation): TStationState | undefined {
    return (
      this.getContextualStationState(chargingStation) ?? this.stationsState.get(chargingStation)
    )
  }

  /**
   * Checks whether the currently executing incoming handler still owns its admission lifecycle.
   * Direct trusted calls outside incoming dispatch have no admission context and remain valid.
   * @param chargingStation - Station whose request admission is being checked
   * @returns Whether the current handler may still mutate station transaction state
   */
  protected isIncomingRequestAdmissionCurrent (chargingStation: ChargingStation): boolean {
    const context = this.stationStateContext.getStore()
    if (context == null) return true
    return (
      context.messageSourceIsCurrent() && this.isIncomingRequestDeliveryCurrent(chargingStation)
    )
  }

  /**
   * Whether the given incoming-request command is supported for this station.
   * @param chargingStation - Target charging station.
   * @param commandName - OCPP incoming-request command name.
   * @returns `true` when the command is supported.
   */
  protected abstract isIncomingRequestCommandSupported (
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand
  ): boolean

  /**
   * Checks whether a deferred response action still belongs to its station lifecycle.
   * Unlike admission ownership, this deliberately permits replay on a replacement socket.
   * @param chargingStation - Station whose response action is being checked
   * @returns Whether the response action may still mutate its captured station state
   */
  protected isIncomingRequestDeliveryCurrent (chargingStation: ChargingStation): boolean {
    const context = this.stationStateContext.getStore()
    if (context == null) return true
    return (
      context.chargingStation === chargingStation &&
      context.messageLifecycleSignal === chargingStation.lifecycleAbortSignal &&
      !context.messageLifecycleSignal.aborted &&
      context.messageLifecycleIsCurrent() &&
      this.stationsState.get(chargingStation) === context.stationState &&
      context.stationState.stopped !== true &&
      !chargingStation.isStopping()
    )
  }

  /**
   * Called when an incoming request response could not be sent.
   * @param _chargingStation - Target charging station.
   * @param _commandName - Incoming request command whose response failed.
   * @param _commandPayload - Incoming request payload associated with the failed response.
   */
  protected onResponseSendError (
    _chargingStation: ChargingStation,
    _commandName: IncomingRequestCommand,
    _commandPayload: JsonType
  ): Promise<void> | void {
    // Optional lifecycle cleanup hook for subclass-owned response reservations.
  }

  /**
   * Hook method paired with the {@link stop} template: releases
   * resources held by the per-station state (abort controllers, timer
   * handles, retry managers, etc.) prior to the template marking the
   * entry `stopped: true` in {@link stationsState}.
   *
   * Implementations MAY throw; on throw the base template skips the
   * `stopped` mark and a subsequent `stop()` re-invokes this hook on
   * the same partially-reset state. Implementations MUST therefore
   * tolerate re-entry on a partially-reset state (idempotent field
   * clears + optional-chained aborts satisfy this). See {@link stop}
   * for the full exception-behavior contract.
   * @param stationState - Per-station state to reset.
   */
  protected abstract resetStationState (stationState: TStationState): void

  /**
   * Whether a delivered response may run its command callback during shutdown.
   * @param _commandName - Delivered incoming command
   * @returns Whether shutdown permits its callback
   */
  // eslint-disable-next-line perfectionist/sort-classes
  protected canDispatchResponseWhileStopping (_commandName: IncomingRequestCommand): boolean {
    return false
  }

  /**
   * Runs lifecycle-changing work outside the incoming-request admission context.
   * Async resources created by the action therefore resolve station state from
   * the current lifecycle instead of inheriting the sealed request lifecycle.
   * @param action - Lifecycle action to invoke without an admission context
   * @returns The action result
   */
  protected runOutsideIncomingRequestContext<T>(action: () => T): T {
    return this.stationStateContext.exit(action)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- P bridges contravariant handler payload signatures into IncomingRequestHandler
  protected toRequestHandler<P extends JsonType>(
    handler: (chargingStation: ChargingStation, commandPayload: P) => JsonType | Promise<JsonType>
  ): IncomingRequestHandler {
    return handler as IncomingRequestHandler
  }

  /**
   * Validates incoming request payload against JSON schema
   * @param chargingStation - The charging station instance processing the request
   * @param commandName - OCPP command name to validate against
   * @param payload - JSON payload to validate
   * @returns `true` when payload validation succeeds; `false` otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  protected validateIncomingRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    payload: T
  ): boolean {
    return validatePayload(
      chargingStation,
      commandName,
      payload,
      this.payloadValidatorFunctions.get(commandName),
      'incoming request'
    )
  }

  private getContextualStationState (chargingStation: ChargingStation): TStationState | undefined {
    const context = this.stationStateContext.getStore()
    return context?.chargingStation === chargingStation ? context.stationState : undefined
  }

  /**
   * Returns the state entry for `chargingStation`, creating one on first
   * access via {@link createStationState}. Subsequent calls return the
   * same reference for the station's active lifecycle.
   *
   * Once {@link stop} has marked the entry `stopped: true`,
   * this method returns the sealed stopped state instead of
   * lazy-init'ing a fresh entry. `.stopped` is written only from
   * {@link stop}, so the guard is unreachable on the pre-stop happy
   * path. Callers that need "silent-drop on stop" semantics MUST NOT
   * rely on this guard alone — they use `stationsState.get(cs)` with
   * an inline `stopped === true` null-guard and return early, because
   * writes performed through this getter still land on the sealed
   * object (harmless but wasteful).
   * @param chargingStation - Target charging station.
   * @returns The lazily-initialized per-station state, or the sealed
   *   stopped state after {@link stop}.
   * @see OCPP20IncomingRequestService.sendNotifyReportRequest for the
   *   consume-only null-guard pattern.
   * @see OCPP20IncomingRequestService.sendSecurityEventNotification for
   *   the lifecycle-entry pattern where creation is required.
   */
  private getOrCreateCurrentStationState (chargingStation: ChargingStation): TStationState {
    let state = this.stationsState.get(chargingStation)
    if (state?.stopped === true) return state
    if (state == null) {
      state = this.createStationState()
      this.stationsState.set(chargingStation, state)
    }
    return state
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private async handleIncomingRequest<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: ReqType,
    messageLifecycleSignal: AbortSignal,
    messageLifecycleIsCurrent: () => boolean,
    messageSourceIsCurrent: () => boolean,
    stationState: TStationState
  ): Promise<void> {
    if (chargingStation.isStopping()) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued while the charging station is stopping`,
        commandName,
        commandPayload
      )
    }
    let response: ResType
    if (
      chargingStation.stationInfo?.ocppStrictCompliance === true &&
      chargingStation.inPendingState() &&
      this.pendingStateBlockedCommands.includes(commandName)
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSONStringify(commandPayload, 2)} while the charging station is in pending state on the ${this.csmsName}`,
        commandName,
        commandPayload
      )
    }
    if (
      chargingStation.inAcceptedState() ||
      chargingStation.inPendingState() ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState())
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) &&
        this.isIncomingRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validateIncomingRequestPayload(chargingStation, commandName, commandPayload)
          const incomingRequestHandler = this.incomingRequestHandlers.get(commandName)
          if (incomingRequestHandler == null) {
            throw new OCPPError(
              ErrorType.NOT_IMPLEMENTED,
              `${commandName} incoming request handler not found`,
              commandName,
              commandPayload
            )
          }
          if (isAsyncFunction(incomingRequestHandler)) {
            response = (await incomingRequestHandler(chargingStation, commandPayload)) as ResType
          } else {
            response = incomingRequestHandler(chargingStation, commandPayload) as ResType
          }
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${this.moduleName}.incomingRequestHandler: Handle incoming request error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request PDU ${JSONStringify(commandPayload, 2)}`,
          commandName,
          commandPayload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSONStringify(commandPayload, 2)} while the charging station is not registered on the ${this.csmsName}`,
        commandName,
        commandPayload
      )
    }
    const admissionStateIsCurrent = (): boolean =>
      this.stationsState.get(chargingStation) === stationState
    const responseCanStartSending = (): boolean =>
      messageSourceIsCurrent() &&
      messageLifecycleIsCurrent() &&
      admissionStateIsCurrent() &&
      !chargingStation.isStopping()
    const responseCanBeDispatched = (): boolean =>
      admissionStateIsCurrent() &&
      ((!chargingStation.isStopping() && messageLifecycleIsCurrent()) ||
        (chargingStation.isStopping() && this.canDispatchResponseWhileStopping(commandName)))
    if (!responseCanStartSending()) {
      await this.onResponseSendError(chargingStation, commandName, commandPayload)
      return
    }
    let bufferedResponseRetainedBytes: number
    try {
      bufferedResponseRetainedBytes =
        Buffer.byteLength(JSON.stringify([commandPayload, response]), 'utf8') +
        this.getResponseDeliveryRetainedBytes(commandName, commandPayload)
    } catch (error) {
      await this.onResponseSendError(chargingStation, commandName, commandPayload)
      throw error
    }
    const deliveryState = { buffered: false, dispatched: false }
    const admissionContext = {
      chargingStation,
      messageLifecycleIsCurrent,
      messageLifecycleSignal,
      messageSourceIsCurrent,
      stationState,
    }
    let responseSendError: Promise<void> | undefined
    const finalizeResponseSendError = (): Promise<void> => {
      if (deliveryState.dispatched) return Promise.resolve()
      responseSendError ??= this.stationStateContext.run(admissionContext, async () => {
        await this.onResponseSendError(chargingStation, commandName, commandPayload)
      })
      return responseSendError
    }
    const dispatchResponse = (): void => {
      this.stationStateContext.run(admissionContext, () => {
        if (deliveryState.dispatched) return
        if (!responseCanBeDispatched()) {
          finalizeResponseSendError().catch((error: unknown) => {
            logger.error(
              `${chargingStation.logPrefix()} ${this.moduleName}.incomingRequestHandler: Response failure cleanup error:`,
              error
            )
          })
          return
        }
        deliveryState.dispatched = true
        if (this.listenerCount(commandName) > 0) {
          this.emit(commandName, chargingStation, commandPayload, response)
        }
      })
    }
    try {
      await chargingStation.ocppRequestService.sendResponse(
        chargingStation,
        messageId,
        response,
        commandName,
        {
          bufferedResponseRetainedBytes,
          onError: () => {
            finalizeResponseSendError().catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${this.moduleName}.incomingRequestHandler: Response failure cleanup error:`,
                error
              )
            })
          },
          onMessageSent: dispatchResponse,
          onRequestBuffered: () => {
            deliveryState.buffered = true
          },
        }
      )
    } catch (error) {
      if (deliveryState.dispatched) return
      if (!deliveryState.buffered) {
        await finalizeResponseSendError()
        throw error
      }
      return
    }
    if (!deliveryState.dispatched && !responseCanBeDispatched()) {
      await finalizeResponseSendError()
      return
    }
    dispatchResponse()
  }
}
