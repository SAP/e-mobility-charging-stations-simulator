export class BaseError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
    typeof Error.captureStackTrace === 'function'
      ? Error.captureStackTrace(this, this.constructor)
      : this.createStack();
  }

  private createStack(): void {
    this.stack = new Error().stack;
  }
}
