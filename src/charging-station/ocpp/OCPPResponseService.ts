import type { ValidateFunction } from 'ajv'
import type _Ajv from 'ajv'

import type { ChargingStation } from '../../charging-station/index.js'

import { OCPPError } from '../../exception/index.js'
import {
  ErrorType,
  type IncomingRequestCommand,
  type JsonType,
  type OCPPVersion,
  type RequestCommand,
  type ResponseHandler,
} from '../../types/index.js'
import { Constants, isAsyncFunction, logger } from '../../utils/index.js'
import { ajvErrorsToErrorType, createAjv } from './OCPPServiceUtils.js'

type Ajv = _Ajv.default

const moduleName = 'OCPPResponseService'

export abstract class OCPPResponseService {
  private static readonly instances = new Map<new () => OCPPResponseService, OCPPResponseService>()
  public abstract incomingRequestResponsePayloadValidateFunctions: Map<
    IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected readonly ajv: Ajv
  protected readonly ajvIncomingRequest: Ajv
  protected abstract readonly bootNotificationRequestCommand: RequestCommand
  protected abstract readonly csmsName: string
  protected emptyResponseHandler = Constants.EMPTY_FUNCTION
  protected abstract readonly moduleName: string
  protected abstract payloadValidatorFunctions: Map<RequestCommand, ValidateFunction<JsonType>>
  protected abstract readonly responseHandlers: Map<RequestCommand, ResponseHandler>
  private readonly version: OCPPVersion

  protected constructor (version: OCPPVersion) {
    this.version = version
    this.ajv = createAjv()
    this.ajvIncomingRequest = createAjv()
    this.responseHandler = this.responseHandler.bind(this)
    this.validateResponsePayload = this.validateResponsePayload.bind(this)
  }

  public static getInstance<T extends OCPPResponseService>(this: new () => T): T {
    if (!OCPPResponseService.instances.has(this)) {
      OCPPResponseService.instances.set(this, new this())
    }
    return OCPPResponseService.instances.get(this) as T
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void> {
    if (
      chargingStation.inAcceptedState() ||
      ((chargingStation.inUnknownState() || chargingStation.inPendingState()) &&
        commandName === this.bootNotificationRequestCommand) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        (chargingStation.inUnknownState() || chargingStation.inPendingState()))
    ) {
      if (
        this.responseHandlers.has(commandName) &&
        this.isRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validateResponsePayload(chargingStation, commandName, payload)
          logger.debug(
            `${chargingStation.logPrefix()} ${this.moduleName}.responseHandler: Handling '${commandName}' response`
          )
          const responseHandler = this.responseHandlers.get(commandName)
          if (responseHandler == null) {
            throw new OCPPError(
              ErrorType.NOT_IMPLEMENTED,
              `${commandName} response handler not found`,
              commandName,
              payload
            )
          }
          if (isAsyncFunction(responseHandler)) {
            await responseHandler(chargingStation, payload, requestPayload)
          } else {
            ;(
              responseHandler as (
                chargingStation: ChargingStation,
                payload: JsonType,
                requestPayload?: JsonType
              ) => void
            )(chargingStation, payload, requestPayload)
          }
          logger.debug(
            `${chargingStation.logPrefix()} ${this.moduleName}.responseHandler: '${commandName}' response processed successfully`
          )
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${this.moduleName}.responseHandler: Handle '${commandName}' response error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle response PDU ${JSON.stringify(
            payload,
            undefined,
            2
          )}`,
          commandName,
          payload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle response PDU ${JSON.stringify(
          payload,
          undefined,
          2
        )} while the charging station is not registered on the ${this.csmsName}`,
        commandName,
        payload
      )
    }
  }

  protected abstract isRequestCommandSupported (
    chargingStation: ChargingStation,
    commandName: RequestCommand
  ): boolean

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- bridges contravariant handler signatures into ResponseHandler
  protected toResponseHandler<P extends JsonType, R extends JsonType>(
    handler: (
      chargingStation: ChargingStation,
      payload: P,
      requestPayload: R
    ) => Promise<void> | void
  ): ResponseHandler {
    return handler as unknown as ResponseHandler
  }

  /**
   * Validates incoming response payload against JSON schema
   * @param chargingStation - The charging station instance receiving the response
   * @param commandName - OCPP command name to validate against
   * @param payload - JSON response payload to validate
   * @returns True if payload validation succeeds, false otherwise
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  protected validateResponsePayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: T
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true
    }
    const validate = this.payloadValidatorFunctions.get(commandName)
    if (validate == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
      )
      return false
    }
    if (validate(payload)) {
      return true
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: Command '${commandName}' response PDU is invalid: %j`,
      validate.errors
    )
    throw new OCPPError(
      ajvErrorsToErrorType(validate.errors),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, undefined, 2)
    )
  }
}
