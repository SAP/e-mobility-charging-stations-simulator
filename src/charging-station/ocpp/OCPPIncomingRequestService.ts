import _Ajv, { type ValidateFunction } from 'ajv'
import _ajvFormats from 'ajv-formats'
import { EventEmitter } from 'node:events'

import type {
  ClearCacheResponse,
  IncomingRequestCommand,
  JsonType,
  OCPPVersion,
} from '../../types/index.js'

import { type ChargingStation, getIdTagsFile } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import { logger } from '../../utils/index.js'
import { OCPPConstants } from './OCPPConstants.js'
import { ajvErrorsToErrorType } from './OCPPServiceUtils.js'

type Ajv = _Ajv.default
// eslint-disable-next-line @typescript-eslint/no-redeclare
const Ajv = _Ajv.default
const ajvFormats = _ajvFormats.default

const moduleName = 'OCPPIncomingRequestService'

export abstract class OCPPIncomingRequestService extends EventEmitter {
  private static instance: null | OCPPIncomingRequestService = null
  protected readonly ajv: Ajv
  protected abstract payloadValidatorFunctions: Map<
    IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  private readonly version: OCPPVersion

  protected constructor (version: OCPPVersion) {
    super()
    this.version = version
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    })
    ajvFormats(this.ajv)
    this.incomingRequestHandler = this.incomingRequestHandler.bind(this)
    this.validateIncomingRequestPayload = this.validateIncomingRequestPayload.bind(this)
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new () => T): T {
    OCPPIncomingRequestService.instance ??= new this()
    return OCPPIncomingRequestService.instance as T
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-parameters
  public abstract incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: ReqType
  ): Promise<void>

  public abstract stop (chargingStation: ChargingStation): void

  protected handleRequestClearCache (chargingStation: ChargingStation): ClearCacheResponse {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (chargingStation.idTagsCache.deleteIdTags(getIdTagsFile(chargingStation.stationInfo!)!)) {
      return OCPPConstants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPPConstants.OCPP_RESPONSE_REJECTED
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  protected validateIncomingRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    payload: T
  ): boolean {
    if (chargingStation.stationInfo?.ocppStrictCompliance === false) {
      return true
    }
    const validate = this.payloadValidatorFunctions.get(commandName)
    if (validate?.(payload) === true) {
      return true
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestPayload: Command '${commandName}' incoming request PDU is invalid: %j`,
      validate?.errors
    )
    throw new OCPPError(
      ajvErrorsToErrorType(validate?.errors),
      'Incoming request PDU is invalid',
      commandName,
      JSON.stringify(validate?.errors, undefined, 2)
    )
  }
}
