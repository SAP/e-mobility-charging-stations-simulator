import {
  ProcedureName,
  type ProtocolRequestHandler,
  ProtocolVersion,
} from '../../../types/UIProtocol';
import type { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';

export default class UIService001 extends AbstractUIService {
  constructor(uiServer: AbstractUIServer) {
    super(uiServer, ProtocolVersion['0.0.1']);
    this.requestHandlers.set(
      ProcedureName.START_CHARGING_STATION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STOP_CHARGING_STATION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.OPEN_CONNECTION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.CLOSE_CONNECTION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.START_TRANSACTION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STOP_TRANSACTION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.AUTHORIZE,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STATUS_NOTIFICATION,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.HEARTBEAT,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.METER_VALUES,
      this.handleProtocolRequest.bind(this) as ProtocolRequestHandler
    );
  }
}
