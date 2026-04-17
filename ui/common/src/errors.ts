import type { ResponsePayload } from './types/UIProtocol.js'

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

export class ServerFailureError extends Error {
  public readonly payload: ResponsePayload

  public constructor (payload: ResponsePayload) {
    const details =
      payload.hashIdsFailed != null && payload.hashIdsFailed.length > 0
        ? `: ${payload.hashIdsFailed.length.toString()} station(s) failed`
        : ''
    super(`Server returned failure status${details}`)
    this.name = 'ServerFailureError'
    this.payload = payload
  }
}

export const extractErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
