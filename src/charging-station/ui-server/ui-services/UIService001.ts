import { JsonType } from '../../../types/JsonType';
import {
  ProcedureName,
  ProtocolRequestHandler,
  ProtocolVersion,
  ResponsePayload,
  ResponseStatus,
} from '../../../types/UIProtocol';
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

  private handleStartTransaction(payload: JsonType): ResponsePayload {
    this.workerBroadcastChannel.postMessage([ProcedureName.START_TRANSACTION, payload]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStopTransaction(payload: JsonType): ResponsePayload {
    this.workerBroadcastChannel.postMessage([ProcedureName.STOP_TRANSACTION, payload]);
    return { status: ResponseStatus.SUCCESS };
  }
}
