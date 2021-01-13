import { ErrorType } from '../types/ocpp/ErrorType';

export default class OCPPError extends Error {
  code: string;
  details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);

    this.code = code || ErrorType.GENERIC_ERROR;
    this.message = message || '';
    this.details = details || {};

    Object.setPrototypeOf(this, OCPPError.prototype); // For instanceof

    Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : (this.stack = (new Error()).stack);
  }
}
