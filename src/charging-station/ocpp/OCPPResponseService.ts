import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'

import type { ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import type {
  IncomingRequestCommand,
  JsonType,
  OCPPVersion,
  RequestCommand
} from '../../types/index.js'
import { Constants, logger } from '../../utils/index.js'
import { ajvErrorsToErrorType } from './OCPPServiceUtils.js'
type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

const moduleName = 'OCPPResponseService'

export abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null
  private readonly version: OCPPVersion
  protected readonly ajv: Ajv
  protected readonly ajvIncomingRequest: Ajv
  protected abstract payloadValidateFunctions: Map<RequestCommand, ValidateFunction<JsonType>>
  public abstract incomingRequestResponsePayloadValidateFunctions: Map<
  IncomingRequestCommand,
  ValidateFunction<JsonType>
  >

  protected constructor (version: OCPPVersion) {
    this.version = version
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2
    })
    ajvFormats(this.ajv)
    this.ajvIncomingRequest = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2
    })
    ajvFormats(this.ajvIncomingRequest)
    this.responseHandler = this.responseHandler.bind(this)
    this.validateResponsePayload = this.validateResponsePayload.bind(this)
  }

  public static getInstance<T extends OCPPResponseService>(this: new () => T): T {
    if (OCPPResponseService.instance === null) {
      OCPPResponseService.instance = new this()
    }
    return OCPPResponseService.instance as T
  }

  protected validateResponsePayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: T
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true
    }
    const validate = this.payloadValidateFunctions.get(commandName)
    if (validate?.(payload) === true) {
      return true
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: Command '${commandName}' response PDU is invalid: %j`,
      validate?.errors
    )
    throw new OCPPError(
      ajvErrorsToErrorType(validate?.errors),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate?.errors, undefined, 2)
    )
  }

  protected emptyResponseHandler = Constants.EMPTY_FUNCTION

  public abstract responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void>
}
