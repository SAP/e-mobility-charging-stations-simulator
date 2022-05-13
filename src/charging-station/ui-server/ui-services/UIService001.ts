import { ProtocolCommand, ProtocolRequestHandler } from '../../../types/UIProtocol';

import { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';
import { JsonType } from '../../../types/JsonType';

export default class UIService001 extends AbstractUIService {
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
  }

  private handleStartTransaction(payload: JsonType): void {}
  private handleStopTransaction(payload: JsonType): void {}
}
