import { RequestCommand } from '../types/ocpp/Requests';
import {
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionReason,
  StopTransactionRequest,
  StopTransactionResponse,
} from '../types/ocpp/Transaction';
import {
  BroadcastChannelProcedureName,
  BroadcastChannelRequest,
} from '../types/WorkerBroadcastChannel';
import ChargingStation from './ChargingStation';
import WorkerBroadcastChannel from './WorkerBroadcastChannel';

type MessageEvent = { data: unknown };

export default class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    super();
    this.chargingStation = chargingStation;
    this.onmessage = this.handleRequest.bind(this) as (message: MessageEvent) => void;
  }

  private async handleRequest(messageEvent: MessageEvent): Promise<void> {
    const [, command, payload] = messageEvent.data as BroadcastChannelRequest;

    if (payload.hashId !== this.chargingStation.hashId) {
      return;
    }

    // TODO: return a response stating the command success or failure
    switch (command) {
      case BroadcastChannelProcedureName.START_TRANSACTION:
        await this.chargingStation.ocppRequestService.requestHandler<
          StartTransactionRequest,
          StartTransactionResponse
        >(this.chargingStation, RequestCommand.START_TRANSACTION, {
          connectorId: payload.connectorId,
          idTag: payload.idTag,
        });
        break;
      case BroadcastChannelProcedureName.STOP_TRANSACTION:
        await this.chargingStation.ocppRequestService.requestHandler<
          StopTransactionRequest,
          StopTransactionResponse
        >(this.chargingStation, RequestCommand.STOP_TRANSACTION, {
          transactionId: payload.transactionId,
          meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
            payload.transactionId
          ),
          idTag: this.chargingStation.getTransactionIdTag(payload.transactionId),
          reason: StopTransactionReason.NONE,
        });
        break;
      case BroadcastChannelProcedureName.START_CHARGING_STATION:
        this.chargingStation.start();
        break;
      case BroadcastChannelProcedureName.STOP_CHARGING_STATION:
        await this.chargingStation.stop();
        break;
    }
  }
}
