import type { JsonType } from './JsonType.js'

export interface HandleErrorParams<T extends JsonType> {
  consoleOut?: boolean
  errorResponse?: T
  throwError?: boolean
}
