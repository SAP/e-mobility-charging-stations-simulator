export class AuthenticationError extends Error {
  public constructor (url: string) {
    super(`Authentication failed for ${url}`)
    this.name = 'AuthenticationError'
  }
}

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

export class ServerError extends Error {
  public readonly payload: unknown

  public constructor (payload: unknown) {
    super('Server returned failure status')
    this.name = 'ServerError'
    this.payload = payload
  }
}

export class TimeoutError extends Error {
  public readonly procedureName: string
  public readonly timeoutMs: number

  public constructor (procedureName: string, timeoutMs: number) {
    super(`Request '${procedureName}' timed out after ${timeoutMs.toString()}ms`)
    this.name = 'TimeoutError'
    this.procedureName = procedureName
    this.timeoutMs = timeoutMs
  }
}
