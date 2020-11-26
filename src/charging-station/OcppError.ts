import Constants from '../utils/Constants';

export default class OCPPError extends Error {
  code: string;
  details: any;

  constructor(code: string, message: string, details?: any) {
    super(message);

    this.code = code || Constants.OCPP_ERROR_GENERIC_ERROR;
    this.message = message || '';
    this.details = details || {};

    Object.setPrototypeOf(this, OCPPError.prototype); // For instanceof

    Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : (this.stack = (new Error()).stack);
  }
}
