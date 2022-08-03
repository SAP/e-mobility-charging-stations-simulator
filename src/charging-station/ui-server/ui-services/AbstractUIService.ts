import { CommandCode, ProtocolMessage, ProtocolRequestHandler } from '../../../types/UIProtocol';

import { AbstractUIServer } from '../AbstractUIServer';
import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import { RawData } from 'ws';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';
import { JsonArray } from '../../../ui/web/src/type/JsonType';

export default abstract class AbstractUIService {
  protected readonly uiServer: AbstractUIServer;
  protected readonly messageHandlers: Map<CommandCode, ProtocolRequestHandler>;

  constructor(uiServer: AbstractUIServer) {
    this.uiServer = uiServer;
    this.messageHandlers = new Map<CommandCode, ProtocolRequestHandler>([
      [
        CommandCode.LIST_CHARGING_STATIONS,
        this.handleListChargingStations.bind(this) as ProtocolRequestHandler,
      ],
    ]);
  }

  public async messageHandler(rdata: RawData): Promise<void> {
    const data = JSON.parse(rdata.toString()) as unknown;

    if (Utils.isIterable(data) === false) {
      throw new BaseError('UI protocol request is not iterable');
    }

    const [uuid, command, payload] = data as ProtocolMessage;

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

    const responseMessage: JsonArray = [uuid, command];
    try {
      responseMessage.push((await commandHandler(payload)) as JsonType);
    } catch (error: unknown) {
      logger.error(this.uiServer.logPrefix() + ' Handle message error: %j', error);
      throw error;
    }

    this.uiServer.sendResponse(JSON.stringify(responseMessage));
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
