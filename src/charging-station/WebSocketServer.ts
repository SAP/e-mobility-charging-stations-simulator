import { IncomingMessage } from 'http';
import WebSocket from 'ws';
import logger from '../utils/Logger';

enum WebSocketServerCommand {
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  UNKNOWN = 'unknown',
}

type WebSocketServerRequest = [WebSocketServerCommand, Record<string, unknown>];

export default class WebSocketServer extends WebSocket.Server {
  public constructor(options?: WebSocket.ServerOptions, callback?: () => void) {
    // Create the WebSocket Server
    super(options, callback);
  }

  public broadcastToClients(message: Record<string, unknown>): void {
    for (const client of this.clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public start(): void {
    // this.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
    //   // Check connection validity
    // });
    this.on('message', (messageData) => {
      let [command, payload]: WebSocketServerRequest = [WebSocketServerCommand.UNKNOWN, {}];
      // FIXME: check for iterable object
      [command, payload] = JSON.parse(messageData.toString()) as WebSocketServerRequest;
      switch (command) {
        case WebSocketServerCommand.START_TRANSACTION:
          break;
        case WebSocketServerCommand.STOP_TRANSACTION:
          break;
        default:
          logger.warn(`Unknown command: ${command}`);
      }
    });
  }
}
