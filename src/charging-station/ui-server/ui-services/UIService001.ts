import { BroadcastChannel, isMainThread } from 'worker_threads';
import { CommandCode, ProtocolRequestHandler } from '../../../types/UIProtocol';

import { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';
import { JsonType } from '../../../types/JsonType';

export default class UIService001 extends AbstractUIService {
  private channel = new BroadcastChannel('test');

  constructor(uiServer: AbstractUIServer) {
    super(uiServer);
    this.messageHandlers.set(
      CommandCode.START_TRANSACTION,
      this.handleStartTransaction.bind(this) as ProtocolRequestHandler
    );
    this.messageHandlers.set(
      CommandCode.STOP_TRANSACTION,
      this.handleStopTransaction.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartTransaction(payload: JsonType): void {
    this.channel.postMessage(payload);
  }

  private handleStopTransaction(payload: JsonType): void {
    this.channel.postMessage(payload);
  }
}
