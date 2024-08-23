/* eslint-disable perfectionist/sort-enums */
export const WebSocketCloseEventStatusString: Record<WebSocketCloseEventStatusCode, string> =
  Object.freeze({
    1000: 'Normal Closure',
    1001: 'Going Away',
    1002: 'Protocol Error',
    1003: 'Unsupported Frame Data',
    1004: 'Reserved',
    1005: 'No Status Received',
    1006: 'Abnormal Closure',
    1007: 'Invalid Frame Payload Data',
    1008: 'Policy Violation',
    1009: 'Message Too Large',
    1010: 'Missing Extension',
    1011: 'Server Internal Error',
    1012: 'Service Restart',
    1013: 'Try Again Later',
    1014: 'Bad Gateway',
    1015: 'TLS Handshake',
  })

export enum WebSocketCloseEventStatusCode {
  CLOSE_NORMAL = 1000,
  CLOSE_GOING_AWAY = 1001,
  CLOSE_PROTOCOL_ERROR = 1002,
  CLOSE_UNSUPPORTED = 1003,
  CLOSE_RESERVED = 1004,
  CLOSE_NO_STATUS = 1005,
  CLOSE_ABNORMAL = 1006,
  CLOSE_INVALID_PAYLOAD = 1007,
  CLOSE_POLICY_VIOLATION = 1008,
  CLOSE_TOO_LARGE = 1009,
  CLOSE_MISSING_EXTENSION = 1010,
  CLOSE_SERVER_INTERNAL_ERROR = 1011,
  CLOSE_SERVICE_RESTART = 1012,
  CLOSE_TRY_AGAIN_LATER = 1013,
  CLOSE_BAD_GATEWAY = 1014,
  CLOSE_TLS_HANDSHAKE = 1015
}

export interface WSError extends Error {
  code?: string
}
