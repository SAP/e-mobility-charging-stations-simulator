// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ErrorType, IncomingRequestCommand, JsonType, RequestCommand } from '../types/index.js'

import { Constants } from '../utils/index.js'
import { BaseError } from './BaseError.js'

export class OCPPError extends BaseError {
  code: ErrorType
  command: IncomingRequestCommand | RequestCommand
  details?: JsonType

  constructor (
    code: ErrorType,
    message: string,
    command?: IncomingRequestCommand | RequestCommand,
    details?: JsonType
  ) {
    super(message)

    this.code = code
    this.command = command ?? Constants.UNKNOWN_OCPP_COMMAND
    this.details = details
  }
}
