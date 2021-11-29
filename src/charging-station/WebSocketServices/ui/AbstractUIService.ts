import { ProtocolCommand, ProtocolVersion } from '../../../types/UIProtocol';

import WebSocketServer from '../../WebSocketServer';

export default abstract class AbstractUIService {
  public readonly chargingStations: Set<string>;
  protected readonly webSocketServer: WebSocketServer;

  constructor(webSocketServer: WebSocketServer) {
    this.chargingStations = new Set<string>();
    this.webSocketServer = webSocketServer;
  }

  protected buildProtocolMessage(
      version: ProtocolVersion,
      command: ProtocolCommand,
      payload: Record<string, unknown>,
  ): string {
    return JSON.stringify([version, command, payload]);
  }

  abstract handleMessage(version: ProtocolVersion, command: ProtocolCommand, payload: Record<string, unknown>): Promise<void>;
}
