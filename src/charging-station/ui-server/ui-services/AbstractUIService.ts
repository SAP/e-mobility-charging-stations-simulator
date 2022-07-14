import {
  CommandCode,
  MessageCode,
  ProtocolCommand,
  ProtocolMessage,
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
  protected readonly messageHandlers: Map<CommandCode, ProtocolRequestHandler>;

  constructor(uiServer: AbstractUIServer) {
    this.uiServer = uiServer;
    this.messageHandlers = new Map<CommandCode, ProtocolRequestHandler>([
      [CommandCode.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
    ]);
  }

  public messageHandler(message: RawData): void {
    const [code, ...payload] = JSON.parse(message.toString()) as ProtocolMessage;
    console.debug(code, payload);

    switch (code) {
      case MessageCode.REQUEST:
        this.requestHandler(payload as unknown as ProtocolRequest).catch(console.error);
        break;
      case MessageCode.ANSWER:
        break;
      case MessageCode.ERROR:
        break;
      default:
    }
  }

  private async requestHandler(request: ProtocolRequest): Promise<void> {
    const [id, command, payload] = request;
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

    let commandOutput: JsonType;
    try {
      commandOutput = (await commandHandler(payload)) as JsonType;
    } catch (error: unknown) {
      logger.error(this.uiServer.logPrefix() + ' Handle message error: %j', error);
      throw error;
    }

    this.uiServer.sendResponse(JSON.stringify([MessageCode.ANSWER, id, command, commandOutput]));
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
