import { ProtocolCommand, ProtocolRequestHandler } from '../../types/UiProtocol';

import AbstractUIService from './AbstractUIService';
import UIWebSocketServer from '../UIWebSocketServer';

export default class UIService001 extends AbstractUIService {
  constructor(uiWebSocketServer: UIWebSocketServer) {
    super(uiWebSocketServer);
    this.messageHandlers.set(ProtocolCommand.START_TRANSACTION, this.handleStartTransaction.bind(this) as ProtocolRequestHandler);
    this.messageHandlers.set(ProtocolCommand.STOP_TRANSACTION, this.handleStopTransaction.bind(this) as ProtocolRequestHandler);
  }

  private handleStartTransaction(payload: Record<string, unknown>): void { }
  private handleStopTransaction(payload: Record<string, unknown>): void { }
}
