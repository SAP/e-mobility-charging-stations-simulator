import _Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'

import { OCPPServiceUtils } from './OCPPServiceUtils.js'
import type { ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import type {
  IncomingRequestCommand,
  JsonType,
  OCPPVersion,
  RequestCommand
} from '../../types/index.js'
import { Constants, logger } from '../../utils/index.js'
type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

const moduleName = 'OCPPResponseService'

export abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null

  public jsonIncomingRequestResponseValidateFunctions: Map<
  IncomingRequestCommand,
  ValidateFunction<JsonType>
  >

  private readonly version: OCPPVersion
  private readonly ajv: Ajv
  private readonly jsonRequestValidateFunctions: Map<RequestCommand, ValidateFunction<JsonType>>

  public abstract jsonIncomingRequestResponseSchemas: Map<
  IncomingRequestCommand,
  JSONSchemaType<JsonType>
  >

  protected constructor (version: OCPPVersion) {
    this.version = version
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2
    })
    ajvFormats(this.ajv)
    this.jsonRequestValidateFunctions = new Map<RequestCommand, ValidateFunction<JsonType>>()
    this.jsonIncomingRequestResponseValidateFunctions = new Map<
    IncomingRequestCommand,
    ValidateFunction<JsonType>
    >()
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
    schema: JSONSchemaType<T>,
    payload: T
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true
    }
    const validate = this.getJsonRequestValidateFunction<T>(commandName, schema)
    if (validate(payload)) {
      return true
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: Command '${commandName}' response PDU is invalid: %j`,
      validate.errors
    )
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, undefined, 2)
    )
  }

  protected emptyResponseHandler = Constants.EMPTY_FUNCTION

  private getJsonRequestValidateFunction<T extends JsonType>(
    commandName: RequestCommand,
    schema: JSONSchemaType<T>
  ): ValidateFunction<JsonType> {
    if (!this.jsonRequestValidateFunctions.has(commandName)) {
      this.jsonRequestValidateFunctions.set(commandName, this.ajv.compile<T>(schema).bind(this))
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.jsonRequestValidateFunctions.get(commandName)!
  }

  public abstract responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void>
}
