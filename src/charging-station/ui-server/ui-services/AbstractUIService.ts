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
import { Message } from '../../../types/SimulatorUI';

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
    const message = JSON.parse(request.toString()) as Message;
    console.debug(message);
    if (!Utils.isIterable(message)) {
      throw new BaseError('UI packet is not iterable');
    }

    const [msgId, protocolRequest] = message;
    if (!Utils.isIterable(protocolRequest)) {
      throw new BaseError('UI protocol request is not iterable');
    }

    const commandResponse = await this.handleCommand(...protocolRequest);
    logger.debug(`${this.logPrefix()} messageHandler | ${JSON.stringify(commandResponse)}`);

    // Send the message response
    const packetResponse = this.buildPacketMessage(msgId, commandResponse);
    this.uiServer.sendResponse(packetResponse);
  }

  private buildPacketMessage(msgId: number, payload: JsonType): string {
    return JSON.stringify([msgId, payload]);
  }

  private async handleCommand(command: ProtocolCommand, payload: JsonType): Promise<JsonType> {
    console.debug(command, payload);
    const commandHandler = this.messageHandlers.get(command);
    if (Utils.isUndefined(commandHandler)) {
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
      return [command, (await commandHandler(payload)) as JsonType];
    } catch (error: unknown) {
      logger.error(this.uiServer.logPrefix() + ' Handle message error: %j', error);
      throw error;
    }
  }

  private buildProtocolMessage(command: ProtocolCommand, payload: JsonType): string {
    return JSON.stringify([command, payload]);
  }

  private handleListChargingStations(): JsonType {
    return Array.from(
      this.uiServer.chargingStations,
      ([_key, value]) => value as unknown as JsonType
    );
  }

  private logPrefix(): string {
    return Utils.logPrefix(' AbstractUIService |');
  }
}
