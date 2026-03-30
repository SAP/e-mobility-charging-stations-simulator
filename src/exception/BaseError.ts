export class BaseError extends Error {
  public date: Date

  public constructor (message?: string) {
    super(message)
    this.name = new.target.name
    this.date = new Date()
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
