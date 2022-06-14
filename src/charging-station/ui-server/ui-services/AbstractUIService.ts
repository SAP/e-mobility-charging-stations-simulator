import {
  ProtocolCommand,
  ProtocolRequest,
  ProtocolRequestHandler,
} from '../../../types/UIProtocol';

import { AbstractUIServer } from '../AbstractUIServer';
import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import { RawData } from 'ws';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export default abstract class AbstractUIService {
  protected readonly uiServer: AbstractUIServer;
  protected readonly messageHandlers: Map<ProtocolCommand, ProtocolRequestHandler>;

  constructor(uiServer: AbstractUIServer) {
    this.uiServer = uiServer;
    this.messageHandlers = new Map<ProtocolCommand, ProtocolRequestHandler>([
      [ProtocolCommand.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
    ]);
  }

  public async messageHandler(request: RawData): Promise<void> {
    const protocolRequest = JSON.parse(request.toString()) as ProtocolRequest;
    if (!Utils.isIterable(protocolRequest)) {
      throw new BaseError('UI protocol request is not iterable');
    }
    const [command, payload] = protocolRequest;

    const messageResponse: JsonType = await this.handleCommand(command, payload);

    logger.debug(`${this.logPrefix()} messageHandler | ${JSON.stringify(messageResponse)}`);
    // Send the message response
    this.uiServer.sendResponse(this.buildProtocolMessage(command, messageResponse));
  }

  protected buildProtocolMessage(command: ProtocolCommand, payload: JsonType): string {
    return JSON.stringify([command, payload]);
  }

  private async handleCommand(command: ProtocolCommand, payload: JsonType): Promise<JsonType> {
    const messageHandler = this.messageHandlers.get(command);
    if (Utils.isUndefined(messageHandler)) {
      // Throw exception
      throw new BaseError(
        `${command} is not implemented to handle message payload ${JSON.stringify(
          payload,
          null,
          2
        )}`
      );
    }

    try {
      // Call the message handler to build the message response
      return (await messageHandler(payload)) as JsonType;
    } catch (error) {
      // Log
      logger.error(this.uiServer.logPrefix() + ' Handle message error: %j', error);
      throw error;
    }
  }

  private handleListChargingStations(): JsonType {
    return Array.from(
      this.uiServer.chargingStations,
      ([key, station]) => ({ key, station } as unknown as JsonType)
    );
  }

  private logPrefix(): string {
    return Utils.logPrefix(' AbstractUIService |');
  }
}
