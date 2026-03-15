import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'

import type { ChargingStation } from '../../charging-station/index.js'
import type {
  IncomingRequestCommand,
  JsonType,
  OCPPVersion,
  RequestCommand,
} from '../../types/index.js'

import { OCPPError } from '../../exception/index.js'
import { Constants, logger } from '../../utils/index.js'
import { ajvErrorsToErrorType } from './OCPPServiceUtils.js'

type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

const moduleName = 'OCPPResponseService'

export abstract class OCPPResponseService {
  private static readonly instances = new Map<new () => OCPPResponseService, OCPPResponseService>()
  public abstract incomingRequestResponsePayloadValidateFunctions: Map<
    IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected readonly ajv: Ajv
  protected readonly ajvIncomingRequest: Ajv
  protected emptyResponseHandler = Constants.EMPTY_FUNCTION
  protected abstract payloadValidatorFunctions: Map<RequestCommand, ValidateFunction<JsonType>>
  private readonly version: OCPPVersion

  protected constructor (version: OCPPVersion) {
    this.version = version
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    })
    ajvFormats(this.ajv)
    this.ajvIncomingRequest = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    })
    ajvFormats(this.ajvIncomingRequest)
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
  public abstract responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void>

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
