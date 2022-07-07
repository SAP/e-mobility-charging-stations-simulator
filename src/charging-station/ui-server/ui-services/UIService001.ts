import { ProtocolCommand, ProtocolRequestHandler } from '../../../types/UIProtocol';

import { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';
import { JsonType } from '../../../types/JsonType';
import { BroadcastChannel, isMainThread } from 'worker_threads';

export default class UIService001 extends AbstractUIService {
  private channel = new BroadcastChannel('test');

  constructor(uiServer: AbstractUIServer) {
    super(uiServer);
    this.messageHandlers.set(
      ProtocolCommand.START_TRANSACTION,
      this.handleStartTransaction.bind(this) as ProtocolRequestHandler
    );
    this.messageHandlers.set(
      ProtocolCommand.STOP_TRANSACTION,
      this.handleStopTransaction.bind(this) as ProtocolRequestHandler
    );
    this.channel.onmessage = (ev: unknown) => {
      console.debug('test');
    };
  }

  private handleStartTransaction(payload: JsonType): void {
    console.debug('handleStartTransaction');
    this.channel.postMessage('ceci est un test');
  }

  private handleStopTransaction(payload: JsonType): void {}
}
