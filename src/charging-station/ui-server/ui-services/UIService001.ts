import {
  ProcedureName,
  ProtocolRequestHandler,
  ProtocolVersion,
  RequestPayload,
  ResponsePayload,
  ResponseStatus,
} from '../../../types/UIProtocol';
import { BroadcastChannelProcedureName } from '../../../types/WorkerBroadcastChannel';
import Utils from '../../../utils/Utils';
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

  private handleStartTransaction(payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.postMessage([
      Utils.generateUUID(),
      BroadcastChannelProcedureName.START_TRANSACTION,
      payload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStopTransaction(payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.postMessage([
      Utils.generateUUID(),
      BroadcastChannelProcedureName.STOP_TRANSACTION,
      payload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStartChargingStation(payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.postMessage([
      Utils.generateUUID(),
      BroadcastChannelProcedureName.START_CHARGING_STATION,
      payload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }

  private handleStopChargingStation(payload: RequestPayload): ResponsePayload {
    this.workerBroadcastChannel.postMessage([
      Utils.generateUUID(),
      BroadcastChannelProcedureName.STOP_CHARGING_STATION,
      payload,
    ]);
    return { status: ResponseStatus.SUCCESS };
  }
}
