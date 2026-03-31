// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ErrorType, IncomingRequestCommand, JsonType, RequestCommand } from '../types/index.js'

import { OCPPConstants } from '../charging-station/ocpp/OCPPConstants.js'
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
    this.command = command ?? OCPPConstants.UNKNOWN_OCPP_COMMAND
    this.details = details
  }
}
