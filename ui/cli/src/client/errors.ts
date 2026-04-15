export class ConnectionError extends Error {
  public readonly url: string

  public constructor (url: string, cause?: unknown) {
    const causeMsg = cause instanceof Error && cause.message.length > 0 ? `: ${cause.message}` : ''
    super(`Failed to connect to ${url}${causeMsg}`)
    this.name = 'ConnectionError'
    this.url = url
    if (cause != null) {
      this.cause = cause
    }
  }
}
