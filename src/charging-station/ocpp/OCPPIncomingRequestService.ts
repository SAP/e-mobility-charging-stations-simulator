import type { ValidateFunction } from 'ajv'

import { EventEmitter } from 'node:events'

import { type ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import {
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
 * - a lazy-init getter (`getOrCreateStationState`);
 * - a concrete `stop()` template that resets and drops the entry.
 *
 * Subclass contract:
 * - `createStationState` — factory returning the initial state object.
 * - `resetStationState` — releases any resources held by the state
 *   (abort controllers, timer handles, retry managers).
 *
 * The `stop()` template owns the ordering invariant (reset before delete)
 * and the "only-if-present" guard. Subclasses that need additional
 * lifecycle cleanup should override `stop()` and call `super.stop()`
 * first; override `resetStationState` (not `stop()`) for state-field
 * reset logic.
 * @template TStationState - Concrete per-station state shape.
 * The default `object` bound is load-bearing: it allows the bare
 * `OCPPIncomingRequestService` reference in the static singleton
 * registry ({@link OCPPIncomingRequestService.instances}) and in the
 * `getInstance<T extends OCPPIncomingRequestService>` constraint to
 * resolve to `OCPPIncomingRequestService<object>`. Removing the default
 * would break both declarations with `TS2314` (generic type requires
 * type arguments). The bound also matches the `WeakMap` value-type
 * requirement (values must be non-primitive).
 */
export abstract class OCPPIncomingRequestService<
  TStationState extends object = object
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: ReqType
  ): Promise<void> {
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
    await chargingStation.ocppRequestService.sendResponse(
      chargingStation,
      messageId,
      response,
      commandName
    )
    // Emit command name event to allow delayed handling only if there are listeners
    if (this.listenerCount(commandName) > 0) {
      this.emit(commandName, chargingStation, commandPayload, response)
    }
  }

  /**
   * Stops the incoming-request service for the given charging station.
   *
   * Template method: subclasses SHOULD NOT override the template steps
   * (WeakMap lookup, reset, delete) — override {@link resetStationState}
   * for field-level cleanup. Subclasses MAY override to add
   * lifecycle-scoped side effects (e.g. clearing external caches keyed
   * on the station); such overrides MUST call `super.stop()` first so
   * the reset-then-delete ordering is preserved.
   *
   * Exception behavior: if {@link resetStationState} throws, `WeakMap`
   * eviction is skipped and a subsequent `stop()` re-invokes the hook
   * on the same state. Any subclass extension after `super.stop()` is
   * also skipped, as the throw propagates. Matches pre-refactor
   * semantics exactly.
   * @param chargingStation - Target charging station.
   */
  public stop (chargingStation: ChargingStation): void {
    const stationState = this.stationsState.get(chargingStation)
    if (stationState != null) {
      this.resetStationState(stationState)
      this.stationsState.delete(chargingStation)
    }
  }

  /**
   * Hook method: creates the initial per-station state, called on first
   * access via {@link getOrCreateStationState}.
   * @returns A fresh state object with default field values.
   */
  protected abstract createStationState (): TStationState

  /**
   * Returns the state entry for `chargingStation`, creating one on first
   * access via {@link createStationState}. Subsequent calls return the
   * same reference until {@link stop} evicts the entry.
   * @param chargingStation - Target charging station.
   * @returns The lazily-initialized per-station state.
   */
  protected getOrCreateStationState (chargingStation: ChargingStation): TStationState {
    let state = this.stationsState.get(chargingStation)
    if (state == null) {
      state = this.createStationState()
      this.stationsState.set(chargingStation, state)
    }
    return state
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
   * Hook method paired with the {@link stop} template: releases
   * resources held by the per-station state (abort controllers, timer
   * handles, retry managers, etc.) prior to eviction from
   * {@link stationsState}.
   *
   * Implementations MAY throw; on throw the base template skips
   * `WeakMap` eviction and a subsequent `stop()` re-invokes this hook
   * on the same partially-reset state. Implementations MUST therefore
   * tolerate re-entry on a partially-reset state (idempotent field
   * clears + optional-chained aborts satisfy this). See {@link stop}
   * for the full exception-behavior contract.
   * @param stationState - Per-station state to reset.
   */
  protected abstract resetStationState (stationState: TStationState): void

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- bridges contravariant handler signatures into IncomingRequestHandler
  protected toRequestHandler<P extends JsonType, R extends JsonType>(
    handler: (chargingStation: ChargingStation, commandPayload: P) => Promise<R> | R
  ): IncomingRequestHandler {
    return handler as unknown as IncomingRequestHandler
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
}
