// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import {
  AuthorizeRequest,
  AuthorizeResponse,
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionReason,
  StopTransactionRequest,
  StopTransactionResponse,
} from '../types/ocpp/Transaction';
import { BroadcastChannel, parentPort, threadId, workerData } from 'worker_threads';
import {
  ChargingStationWorkerData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';

import ChargingStation from './ChargingStation';
import { ChargingStationUtils } from './ChargingStationUtils';
import { CommandCode } from '../types/UIProtocol';
import { MessageEvent } from 'ws';
import { RequestCommand } from '../types/ocpp/Requests';
import { ThreadWorker } from 'poolifier';
import Utils from '../utils/Utils';
import WorkerConstants from '../worker/WorkerConstants';
import logger from '../utils/Logger';

// Conditionally export ThreadWorker instance for pool usage
export let threadWorker: ThreadWorker;
if (ChargingStationUtils.workerPoolInUse()) {
  threadWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation, {
    maxInactiveTime: WorkerConstants.POOL_MAX_INACTIVE_TIME,
    async: false,
  });
} else {
  // Add message listener to start charging station from main thread
  addMessageListener();
  if (!Utils.isUndefined(workerData)) {
    startChargingStation(workerData as ChargingStationWorkerData);
  }
}

class TEMP {
  public hashId: string;
  public command: CommandCode;
  public connectorId: number;
  public idTag: string | null;
}

let station: ChargingStation;
const channel = new BroadcastChannel('test');
channel.onmessage = (message: MessageEvent) => {
  const data = message.data as unknown as TEMP;

  if (data.hashId !== station.hashId) {
    return;
  }

  console.debug(station.connectors);
  switch (data.command) {
    case CommandCode.START_TRANSACTION:
      void startTransaction(data.connectorId, data.idTag);
      break;
    case CommandCode.STOP_TRANSACTION:
      void stopTransaction(data.connectorId);
      break;
  }
};

/**
 * @param connectorId Id of the connector used
 * @param idTag RFID tag used
 */
async function startTransaction(connectorId: number, idTag: string): Promise<void> {
  station.getConnectorStatus(connectorId).authorizeIdTag = 'TEST';
  try {
    const authorizeResponse = await station.ocppRequestService.requestHandler<
      AuthorizeRequest,
      AuthorizeResponse
    >(station, RequestCommand.AUTHORIZE, {
      idTag,
    });
    console.debug('Authorize:', authorizeResponse);
    const startResponse = await station.ocppRequestService.requestHandler<
      StartTransactionRequest,
      StartTransactionResponse
    >(station, RequestCommand.START_TRANSACTION, {
      connectorId,
      idTag,
    });
    console.debug('StartT:', startResponse);
  } catch (error: unknown) {
    console.error(error);
  }
}

/**
 * @param connectorId Id of the connector used
 */
async function stopTransaction(connectorId: number): Promise<void> {
  try {
    const transactionId = station.getConnectorStatus(connectorId).transactionId;
    console.debug('transactionId:', transactionId);

    const stopResponse = await station.ocppRequestService.requestHandler<
      StopTransactionRequest,
      StopTransactionResponse
    >(station, RequestCommand.STOP_TRANSACTION, {
      transactionId,
      meterStop: station.getEnergyActiveImportRegisterByTransactionId(transactionId),
      idTag: station.getTransactionIdTag(transactionId),
      reason: StopTransactionReason.NONE,
    });

    console.debug('stopT:', stopResponse);
  } catch (error: unknown) {
    console.error(error);
  }
}

/**
 * Listen messages send by the main thread
 */
function addMessageListener(): void {
  parentPort?.on('message', (message: ChargingStationWorkerMessage) => {
    logger.debug(`${logPrefix()} ${JSON.stringify(message)}`);
    if (message.id === ChargingStationWorkerMessageEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.data);
    }
  });
}

/**
 * Create and start a charging station instance
 *
 * @param data workerData
 */
function startChargingStation(data: ChargingStationWorkerData): void {
  station = new ChargingStation(data.index, data.templateFile);
  station.start();
}

/**
 * @returns ChargingStationWorker logger prefix
 */
function logPrefix(): string {
  return Utils.logPrefix(' ChargingStationWorker |');
}
