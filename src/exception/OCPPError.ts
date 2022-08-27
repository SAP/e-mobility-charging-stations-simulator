// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import type { JsonType } from '../types/JsonType';
import { ErrorType } from '../types/ocpp/ErrorType';
import type { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';
import BaseError from './BaseError';

export default class OCPPError extends BaseError {
  code: ErrorType;
  command?: RequestCommand | IncomingRequestCommand;
  details?: JsonType;

  constructor(
    code: ErrorType,
    message: string,
    command?: RequestCommand | IncomingRequestCommand,
    details?: JsonType
  ) {
    super(message);

    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.command = command;
    this.details = details ?? {};
  }
}
