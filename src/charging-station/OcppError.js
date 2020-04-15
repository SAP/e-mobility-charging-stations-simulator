class OCPPError extends Error {
  constructor(code, message, details) {
    super(message);

    this.code = code;
    this.message = message;
    this.details = details;

    Object.setPrototypeOf(this, OCPPError.prototype); // for instanceof

    Error.captureStackTrace ? (Error.captureStackTrace(this, this.constructor)) : (this.stack = (new Error()).stack);
  }
}

module.exports = OCPPError;
