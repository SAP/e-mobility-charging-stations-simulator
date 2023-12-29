import type { JsonType } from './JsonType.js'

export interface HandleErrorParams<T extends JsonType> {
  throwError?: boolean
  consoleOut?: boolean
  errorResponse?: T
}
