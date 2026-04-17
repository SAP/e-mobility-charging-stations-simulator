import { Protocol, ProtocolVersion } from './types/UIProtocol.js'

export const DEFAULT_HOST = 'localhost'
export const DEFAULT_PORT = 8080
export const DEFAULT_PROTOCOL = Protocol.UI
export const DEFAULT_PROTOCOL_VERSION = ProtocolVersion['0.0.1']
export const DEFAULT_SECURE = false
export const UI_WEBSOCKET_REQUEST_TIMEOUT_MS = 60_000
