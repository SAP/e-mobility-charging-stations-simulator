import { ProtocolCommand, ProtocolRequestHandler } from '../../types/UIProtocol';

import AbstractUIService from './AbstractUIService';
import { JsonObject } from '../../types/JsonType';
import UIWebSocketServer from '../UIWebSocketServer';

export default class UIService001 extends AbstractUIService {
  constructor(uiWebSocketServer: UIWebSocketServer) {
    super(uiWebSocketServer);
    this.messageHandlers.set(
      ProtocolCommand.START_TRANSACTION,
      this.handleStartTransaction.bind(this) as ProtocolRequestHandler
    );
    this.messageHandlers.set(
      ProtocolCommand.STOP_TRANSACTION,
      this.handleStopTransaction.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartTransaction(payload: JsonObject): void {}
  private handleStopTransaction(payload: JsonObject): void {}
}
