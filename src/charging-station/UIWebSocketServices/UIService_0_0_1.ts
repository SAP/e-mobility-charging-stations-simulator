import AbstractUIService from './AbstractUIService';
import { ProtocolCommand } from '../../types/UIProtocol';
import UIWebSocketServer from '../UIWebSocketServer';

export default class UIService_0_0_1 extends AbstractUIService {
  constructor(uiWebSocketServer: UIWebSocketServer) {
    super(uiWebSocketServer);
    this.messageHandlers.set(ProtocolCommand.START_TRANSACTION, this.handleStartTransaction.bind(this));
    this.messageHandlers.set(ProtocolCommand.STOP_TRANSACTION, this.handleStopTransaction.bind(this));
  }

  private handleStartTransaction(payload: Record<string, unknown>): void { }
  private handleStopTransaction(payload: Record<string, unknown>): void { }
}
