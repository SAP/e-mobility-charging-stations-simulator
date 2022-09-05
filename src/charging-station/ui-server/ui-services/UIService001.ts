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
    this.requestHandlers.set(
      ProcedureName.STATUS_NOTIFICATION,
      this.handleStatusNotification.bind(this) as ProtocolRequestHandler
    );
    this.requestHandlers.set(
      ProcedureName.HEARTBEAT,
      this.handleHeartbeat.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartChargingStation(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(
      uuid,
      BroadcastChannelProcedureName.START_CHARGING_STATION,
      payload
    );
  }

  private handleStopChargingStation(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(
      uuid,
      BroadcastChannelProcedureName.STOP_CHARGING_STATION,
      payload
    );
  }

  private handleOpenConnection(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(uuid, BroadcastChannelProcedureName.OPEN_CONNECTION, payload);
  }

  private handleCloseConnection(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(uuid, BroadcastChannelProcedureName.CLOSE_CONNECTION, payload);
  }

  private handleStartTransaction(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(
      uuid,
      BroadcastChannelProcedureName.START_TRANSACTION,
      payload
    );
  }

  private handleStopTransaction(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(uuid, BroadcastChannelProcedureName.STOP_TRANSACTION, payload);
  }

  private handleStartAutomaticTransactionGenerator(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(
      uuid,
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      payload
    );
  }

  private handleStopAutomaticTransactionGenerator(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(
      uuid,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      payload
    );
  }

  private handleStatusNotification(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(
      uuid,
      BroadcastChannelProcedureName.STATUS_NOTIFICATION,
      payload
    );
  }

  private handleHeartbeat(uuid: string, payload: RequestPayload): void {
    this.sendBroadcastChannelRequest(uuid, BroadcastChannelProcedureName.HEARTBEAT, payload);
  }
}
