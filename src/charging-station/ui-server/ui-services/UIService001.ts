import {
  ProcedureName,
  ProtocolRequestHandler,
  ProtocolVersion,
  RequestPayload,
} from '../../../types/UIProtocol';
import {
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload,
} from '../../../types/WorkerBroadcastChannel';
import type { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';

export default class UIService001 extends AbstractUIService {
  constructor(uiServer: AbstractUIServer) {
    super(uiServer, ProtocolVersion['0.0.1']);
    this.requestHandlers.set(
      ProcedureName.START_CHARGING_STATION,
      this.handleStartChargingStation.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STOP_CHARGING_STATION,
      this.handleStopChargingStation.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.OPEN_CONNECTION,
      this.handleOpenConnection.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.CLOSE_CONNECTION,
      this.handleCloseConnection.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.START_TRANSACTION,
      this.handleStartTransaction.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STOP_TRANSACTION,
      this.handleStopTransaction.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      this.handleStartAutomaticTransactionGenerator.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      this.handleStopAutomaticTransactionGenerator.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartChargingStation(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.START_CHARGING_STATION,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleStopChargingStation(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.STOP_CHARGING_STATION,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleOpenConnection(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.OPEN_CONNECTION,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleCloseConnection(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.CLOSE_CONNECTION,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleStartTransaction(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.START_TRANSACTION,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleStopTransaction(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.STOP_TRANSACTION,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleStartAutomaticTransactionGenerator(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      payload as BroadcastChannelRequestPayload,
    ]);
  }

  private handleStopAutomaticTransactionGenerator(uuid: string, payload: RequestPayload): void {
    this.uiServiceWorkerBroadcastChannel.sendRequest([
      uuid,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      payload as BroadcastChannelRequestPayload,
    ]);
  }
}
