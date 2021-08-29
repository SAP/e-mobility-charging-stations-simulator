import { ErrorType } from '../../types/ocpp/ErrorType';
import { IncomingRequestCommand } from '../../types/ocpp/Requests';

export default class OCPPError extends Error {
  code: ErrorType | IncomingRequestCommand;
  details?: unknown;

  constructor(code: ErrorType | IncomingRequestCommand, message: string, details?: unknown) {
    super(message);

    this.name = new.target.name;
    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.message = message ?? '';
    this.details = details ?? {};

    Object.setPrototypeOf(this, new.target.prototype);

    Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : (this.stack = (new Error()).stack);
  }
}
