// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ErrorType, JsonType, OCPPCommandName } from '../types/index.js'

// Direct path: the `ocpp/index.js` barrel pulls OCPP20ServiceUtils which transitively imports OCPPError, causing a TDZ cycle.
import { OCPPConstants } from '../charging-station/ocpp/OCPPConstants.js'
import { BaseError } from './BaseError.js'

export class OCPPError extends BaseError {
  code: ErrorType
  command: OCPPCommandName
  details?: JsonType
  public override readonly name = 'OCPPError' as const

  constructor (code: ErrorType, message: string, command?: OCPPCommandName, details?: JsonType) {
    super(message)

    this.code = code
    this.command = command ?? OCPPConstants.UNKNOWN_OCPP_COMMAND
    this.details = details
  }
}
