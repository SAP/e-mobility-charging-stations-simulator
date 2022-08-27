import type { ResponsePayload } from '../types/UIProtocol';
import type { BroadcastChannelResponse, MessageEvent } from '../types/WorkerBroadcastChannel';
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
    this.validateMessageEvent(messageEvent);
    const [uuid, responsePayload] = messageEvent.data as BroadcastChannelResponse;
    // TODO: handle multiple responses for the same uuid
    delete responsePayload.hashId;

    this.uiService.sendResponse(uuid, responsePayload as ResponsePayload);
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.uiService.logPrefix(moduleName, 'messageErrorHandler')} Error at handling message:`,
      { messageEvent, messageEventData: messageEvent.data }
    );
  }
}
