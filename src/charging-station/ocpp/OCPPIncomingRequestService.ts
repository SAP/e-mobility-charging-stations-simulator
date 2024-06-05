import { EventEmitter } from 'node:events'

import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'

import { type ChargingStation, getIdTagsFile } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import type {
  ClearCacheResponse,
  HandleErrorParams,
  IncomingRequestCommand,
  JsonType,
  OCPPVersion
} from '../../types/index.js'
import { logger, setDefaultErrorParams } from '../../utils/index.js'
import { OCPPConstants } from './OCPPConstants.js'
import { OCPPServiceUtils } from './OCPPServiceUtils.js'
type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

const moduleName = 'OCPPIncomingRequestService'

export abstract class OCPPIncomingRequestService extends EventEmitter {
  private static instance: OCPPIncomingRequestService | null = null
  private readonly version: OCPPVersion
  protected readonly ajv: Ajv
  protected abstract payloadValidateFunctions: Map<
  IncomingRequestCommand,
  ValidateFunction<JsonType>
  >

  protected constructor (version: OCPPVersion) {
    super()
    this.version = version
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2
    })
    ajvFormats(this.ajv)
    this.incomingRequestHandler = this.incomingRequestHandler.bind(this)
    this.validateIncomingRequestPayload = this.validateIncomingRequestPayload.bind(this)
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new () => T): T {
    if (OCPPIncomingRequestService.instance === null) {
      OCPPIncomingRequestService.instance = new this()
    }
    return OCPPIncomingRequestService.instance as T
  }

  protected handleIncomingRequestError<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<T> = { throwError: true, consoleOut: false }
  ): T | undefined {
    params = setDefaultErrorParams(params)
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.handleIncomingRequestError: Incoming request command '${commandName}' error:`,
      error
    )
    console.error('params set', params)
    if (params.throwError === false && params.errorResponse != null) {
      return params.errorResponse
    }
    if (params.throwError === true && params.errorResponse == null) {
      throw error
    }
    if (params.throwError === true && params.errorResponse != null) {
      return params.errorResponse
    }
  }

  protected validateIncomingRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
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
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestPayload: Command '${commandName}' incoming request PDU is invalid: %j`,
      validate?.errors
    )
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate?.errors),
      'Incoming request PDU is invalid',
      commandName,
      JSON.stringify(validate?.errors, undefined, 2)
    )
  }

  protected handleRequestClearCache (chargingStation: ChargingStation): ClearCacheResponse {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (chargingStation.idTagsCache.deleteIdTags(getIdTagsFile(chargingStation.stationInfo!)!)) {
      return OCPPConstants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPPConstants.OCPP_RESPONSE_REJECTED
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public abstract incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: ReqType
  ): Promise<void>
}
