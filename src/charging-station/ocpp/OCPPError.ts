import { IncomingRequestCommand, RequestCommand } from '../../types/ocpp/Requests';

import { ErrorType } from '../../types/ocpp/ErrorType';

export default class OCPPError extends Error {
  code: ErrorType | IncomingRequestCommand;
  command?: RequestCommand | IncomingRequestCommand;
  details?: unknown;

  constructor(code: ErrorType | IncomingRequestCommand, message: string, command?: RequestCommand | IncomingRequestCommand, details?: unknown) {
    super(message);

    this.name = new.target.name;
    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.message = message ?? '';
    this.command = command;
    this.details = details ?? {};

    Object.setPrototypeOf(this, new.target.prototype);

    Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : (this.stack = (new Error()).stack);
  }
}
