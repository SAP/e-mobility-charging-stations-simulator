import { WebSocketReadyState } from '../client/types.js'

export const getWebSocketStateName = (state: number | undefined): string | undefined => {
  switch (state) {
    case WebSocketReadyState.CLOSED:
      return 'Closed'
    case WebSocketReadyState.CLOSING:
      return 'Closing'
    case WebSocketReadyState.CONNECTING:
      return 'Connecting'
    case WebSocketReadyState.OPEN:
      return 'Open'
    default:
      return undefined
  }
}
