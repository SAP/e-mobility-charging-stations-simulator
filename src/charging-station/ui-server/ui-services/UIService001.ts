import {
  ProcedureName,
  ProtocolRequestHandler,
  ProtocolVersion,
  RequestPayload,
} from '../../../types/UIProtocol';
import { BroadcastChannelProcedureName } from '../../../types/WorkerBroadcastChannel';
import type { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';

export default class UIService001 extends AbstractUIService {
  private static readonly ProcedureNameToBroadCastChannelProcedureNameMap: Omit<
    Record<ProcedureName, BroadcastChannelProcedureName>,
    'startSimulator' | 'stopSimulator' | 'listChargingStations'
  > = {
    [ProcedureName.START_CHARGING_STATION]: BroadcastChannelProcedureName.START_CHARGING_STATION,
    [ProcedureName.STOP_CHARGING_STATION]: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
    [ProcedureName.CLOSE_CONNECTION]: BroadcastChannelProcedureName.CLOSE_CONNECTION,
    [ProcedureName.OPEN_CONNECTION]: BroadcastChannelProcedureName.OPEN_CONNECTION,
    [ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR]:
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
    [ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR]:
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
    [ProcedureName.START_TRANSACTION]: BroadcastChannelProcedureName.START_TRANSACTION,
    [ProcedureName.STOP_TRANSACTION]: BroadcastChannelProcedureName.STOP_TRANSACTION,
    [ProcedureName.AUTHORIZE]: BroadcastChannelProcedureName.AUTHORIZE,
    [ProcedureName.STATUS_NOTIFICATION]: BroadcastChannelProcedureName.STATUS_NOTIFICATION,
    [ProcedureName.HEARTBEAT]: BroadcastChannelProcedureName.HEARTBEAT,
    [ProcedureName.METER_VALUES]: BroadcastChannelProcedureName.METER_VALUES,
  };

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

  private handleProtocolRequest(
    uuid: string,
    procedureName: ProcedureName,
    payload: RequestPayload
  ): void {
    this.sendBroadcastChannelRequest(
      uuid,
      UIService001.ProcedureNameToBroadCastChannelProcedureNameMap[
        procedureName
      ] as BroadcastChannelProcedureName,
      payload
    );
  }
}
