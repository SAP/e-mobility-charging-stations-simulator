// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { BaseError } from './BaseError.js';
import {
  ErrorType,
  type IncomingRequestCommand,
  type JsonType,
  type RequestCommand,
} from '../types/index.js';
import { Constants } from '../utils/index.js';

export class OCPPError extends BaseError {
  code: ErrorType;
  command?: RequestCommand | IncomingRequestCommand;
  details?: JsonType;

  constructor(
    code: ErrorType,
    message: string,
    command?: RequestCommand | IncomingRequestCommand,
    details?: JsonType,
  ) {
    super(message);

    this.code = code;
    this.command =
      command ?? (Constants.UNKNOWN_COMMAND as RequestCommand | IncomingRequestCommand);
    this.details = details;
  }
}
