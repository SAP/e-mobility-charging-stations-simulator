import { ProtocolCommand } from '../../../types/UIProtocol';
import WebSocketServer from '../../WebSocketServer';

export default abstract class AbstractUIService {
  protected readonly webSocketServer: WebSocketServer;

  constructor(webSocketServer: WebSocketServer) {
    this.webSocketServer = webSocketServer;
  }

  abstract handleMessage(command: ProtocolCommand, payload: Record<string, unknown>): Promise<void>;
}
