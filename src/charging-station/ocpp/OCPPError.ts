// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { IncomingRequestCommand, RequestCommand } from '../../types/ocpp/Requests';

import BaseError from '../../exception/BaseError';
import { ErrorType } from '../../types/ocpp/ErrorType';

export default class OCPPError extends BaseError {
  code: ErrorType | IncomingRequestCommand;
  command?: RequestCommand | IncomingRequestCommand;
  details?: Record<string, unknown>;

  constructor(code: ErrorType | IncomingRequestCommand, message: string, command?: RequestCommand | IncomingRequestCommand, details?: Record<string, unknown>) {
    super(message);

    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.command = command;
    this.details = details ?? {};
  }
}
