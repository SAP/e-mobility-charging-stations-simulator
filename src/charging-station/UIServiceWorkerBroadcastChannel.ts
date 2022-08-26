import BaseError from '../exception/BaseError';
import { BroadcastChannelResponse, MessageEvent } from '../types/WorkerBroadcastChannel';
import logger from '../utils/Logger';
import type AbstractUIService from './ui-server/ui-services/AbstractUIService';
import WorkerBroadcastChannel from './WorkerBroadcastChannel';

const moduleName = 'UIServiceWorkerBroadcastChannel';

export default class UIServiceWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private uiService: AbstractUIService;

  constructor(uiService: AbstractUIService) {
    super();
    this.uiService = uiService;
    this.onmessage = this.responseHandler.bind(this) as (message: MessageEvent) => void;
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: MessageEvent) => void;
  }

  private responseHandler(messageEvent: MessageEvent): void {
    if (this.isRequest(messageEvent.data)) {
      return;
    }
    if (Array.isArray(messageEvent.data) === false) {
      throw new BaseError('Worker broadcast channel protocol response is not an array');
    }
    const [uuid, responsePayload] = messageEvent.data as BroadcastChannelResponse;

    this.uiService.sendResponse(uuid, responsePayload);
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.uiService.logPrefix(moduleName, 'messageErrorHandler')} Error at handling message:`,
      { messageEvent, messageEventData: messageEvent.data }
    );
  }
}
