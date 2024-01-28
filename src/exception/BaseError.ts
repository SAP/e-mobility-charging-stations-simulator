export class BaseError extends Error {
  public constructor (message?: string) {
    super(message)
    this.name = new.target.name
    Object.setPrototypeOf(this, new.target.prototype)
    if (this.stack == null && typeof BaseError.captureStackTrace === 'function') {
      BaseError.captureStackTrace(this, this.constructor)
    }
  }
}
