import {
  ProcedureName,
  ProtocolRequestHandler,
  ProtocolVersion,
  RequestPayload,
  ResponsePayload,
  ResponseStatus,
} from '../../../types/UIProtocol';
import {
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload,
} from '../../../types/WorkerBroadcastChannel';
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
    this.messageHandlers.set(
      ProcedureName.START_CHARGING_STATION,
      this.handleStartChargingStation.bind(this) as ProtocolRequestHandler
    );
    this.messageHandlers.set(
      ProcedureName.STOP_CHARGING_STATION,
      this.handleStopChargingStation.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartTransaction(uuid: string, payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.START_TRANSACTION,
      payload as BroadcastChannelRequestPayload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStopTransaction(uuid: string, payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.STOP_TRANSACTION,
      payload as BroadcastChannelRequestPayload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStartChargingStation(uuid: string, payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.START_CHARGING_STATION,
      payload as BroadcastChannelRequestPayload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStopChargingStation(uuid: string, payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.STOP_CHARGING_STATION,
      payload as BroadcastChannelRequestPayload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }
}
