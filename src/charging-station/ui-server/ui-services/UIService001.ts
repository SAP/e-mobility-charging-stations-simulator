import { BroadcastChannel } from 'worker_threads';

import { JsonType } from '../../../types/JsonType';
import { ProcedureName, ProtocolRequestHandler, ProtocolVersion } from '../../../types/UIProtocol';
import WorkerChannel from '../../WorkerChannel';
import { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';

export default class UIService001 extends AbstractUIService {
  constructor(uiServer: AbstractUIServer) {
    super(uiServer, ProtocolVersion['0.0.1']);
    this.messageHandlers.set(
      ProcedureName.START_TRANSACTION,
      this.handleStartTransaction.bind(this) as ProtocolRequestHandler
    );
    this.messageHandlers.set(
      ProcedureName.STOP_TRANSACTION,
      this.handleStopTransaction.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartTransaction(payload: JsonType): void {
    const msg = [ProcedureName.START_TRANSACTION, payload];
    WorkerChannel.instance.postMessage([ProcedureName.START_TRANSACTION, payload]);
  }

  private handleStopTransaction(payload: JsonType): void {
    WorkerChannel.instance.postMessage(payload);
  }
}
