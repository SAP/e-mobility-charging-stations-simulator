// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { BroadcastChannel, parentPort, threadId, workerData } from 'worker_threads';
import {
  ChargingStationWorkerData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';
import { Protocol, ProtocolCommand } from '../types/UIProtocol';

import ChargingStation from './ChargingStation';
import { ChargingStationUtils } from './ChargingStationUtils';
import { MessageEvent } from 'ws';
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
  console.log('debug: ', threadId); // debug
}

/**
 * Listen messages send by the main thread
 */
function addMessageListener(): void {
  parentPort.on('message', (message: ChargingStationWorkerMessage) => {
    logger.debug(`${logPrefix()} ${JSON.stringify(message)}`);
    if (message.id === ChargingStationWorkerMessageEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.data);
    }
  });
  const test = new BroadcastChannel('test');
  test.onmessage = (msg: MessageEvent) => {
    console.log(msg.data);

    switch (msg.data[0]) {
      case ProtocolCommand.START_TRANSACTION:
    }
  };
}

/**
 * Create and start a charging station instance
 *
 * @param data workerData
 */
function startChargingStation(data: ChargingStationWorkerData): void {
  const station = new ChargingStation(data.index, data.templateFile);
  station.start();
}

/**
 * @returns ChargingStationWorker logger prefix
 */
function logPrefix(): string {
  return Utils.logPrefix(' ChargingStationWorker |');
}
