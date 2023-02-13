import type { AbstractUIService } from './internal';
import { WorkerBroadcastChannel } from './WorkerBroadcastChannel';
import {
  type BroadcastChannelResponse,
  type BroadcastChannelResponsePayload,
  type MessageEvent,
  type ResponsePayload,
  ResponseStatus,
} from '../types';
import { logger } from '../utils/Logger';

const moduleName = 'UIServiceWorkerBroadcastChannel';

type Responses = {
  responsesExpected: number;
  responsesReceived: number;
  responses: BroadcastChannelResponsePayload[];
};

export class UIServiceWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly uiService: AbstractUIService;
  private readonly responses: Map<string, Responses>;

  constructor(uiService: AbstractUIService) {
    super();
    this.uiService = uiService;
    this.onmessage = this.responseHandler.bind(this) as (message: MessageEvent) => void;
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: MessageEvent) => void;
    this.responses = new Map<string, Responses>();
  }

  private responseHandler(messageEvent: MessageEvent): void {
    const validatedMessageEvent = this.validateMessageEvent(messageEvent);
    if (validatedMessageEvent === false) {
      return;
    }
    if (this.isRequest(validatedMessageEvent.data) === true) {
      return;
    }
    const [uuid, responsePayload] = validatedMessageEvent.data as BroadcastChannelResponse;
    if (this.responses.has(uuid) === false) {
      this.responses.set(uuid, {
        responsesExpected: this.uiService.getBroadcastChannelExpectedResponses(uuid),
        responsesReceived: 1,
        responses: [responsePayload],
      });
    } else if (
      this.responses.get(uuid)?.responsesReceived <= this.responses.get(uuid)?.responsesExpected
    ) {
      this.responses.get(uuid).responsesReceived++;
      this.responses.get(uuid)?.responses.push(responsePayload);
    }
    if (
      this.responses.get(uuid)?.responsesReceived === this.responses.get(uuid)?.responsesExpected
    ) {
      this.uiService.sendResponse(uuid, this.buildResponsePayload(uuid));
      this.responses.delete(uuid);
      this.uiService.deleteBroadcastChannelRequest(uuid);
    }
  }

  private buildResponsePayload(uuid: string): ResponsePayload {
    const responsesStatus =
      this.responses
        .get(uuid)
        ?.responses.every(({ status }) => status === ResponseStatus.SUCCESS) === true
        ? ResponseStatus.SUCCESS
        : ResponseStatus.FAILURE;
    return {
      status: responsesStatus,
      hashIdsSucceeded: this.responses
        .get(uuid)
        ?.responses.filter(({ hashId }) => hashId !== undefined)
        .map(({ status, hashId }) => {
          if (status === ResponseStatus.SUCCESS) {
            return hashId;
          }
        }),
      ...(responsesStatus === ResponseStatus.FAILURE && {
        hashIdsFailed: this.responses
          .get(uuid)
          ?.responses.filter(({ hashId }) => hashId !== undefined)
          .map(({ status, hashId }) => {
            if (status === ResponseStatus.FAILURE) {
              return hashId;
            }
          }),
      }),
      ...(responsesStatus === ResponseStatus.FAILURE && {
        responsesFailed: this.responses
          .get(uuid)
          ?.responses.filter((response) => response !== undefined)
          .map((response) => {
            if (response.status === ResponseStatus.FAILURE) {
              return response;
            }
          }),
      }),
    };
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.uiService.logPrefix(moduleName, 'messageErrorHandler')} Error at handling message:`,
      messageEvent
    );
  }
}
