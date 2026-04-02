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
import { isAsyncFunction, logger } from '../../utils/index.js'
import { type Ajv, createAjv, validatePayload } from './OCPPServiceUtils.js'

export abstract class OCPPIncomingRequestService extends EventEmitter {
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
  private readonly version: OCPPVersion

  protected constructor (version: OCPPVersion) {
    super()
    this.version = version
    this.ajv = createAjv()
    this.incomingRequestHandler = this.incomingRequestHandler.bind(this)
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
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          undefined,
          2
        )} while the charging station is in pending state on the ${this.csmsName}`,
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
          // Log
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
          `${commandName} is not implemented to handle request PDU ${JSON.stringify(
            commandPayload,
            undefined,
            2
          )}`,
          commandName,
          commandPayload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          undefined,
          2
        )} while the charging station is not registered on the ${this.csmsName}`,
        commandName,
        commandPayload
      )
    }
    // Send the built response
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

  public abstract stop (chargingStation: ChargingStation): void

  protected abstract isIncomingRequestCommandSupported (
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand
  ): boolean

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
   * @returns True if payload validation succeeds, false otherwise
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
