export default class BaseError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.createStack();
  }

  private createStack(): void {
    this.stack = new Error().stack;
  }
}
