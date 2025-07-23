import type { AbstractUIService } from '../ui-server/ui-services/AbstractUIService.js'

import {
  type BroadcastChannelResponse,
  type BroadcastChannelResponsePayload,
  type MessageEvent,
  type ResponsePayload,
  ResponseStatus,
} from '../../types/index.js'
import { logger } from '../../utils/index.js'
import { WorkerBroadcastChannel } from './WorkerBroadcastChannel.js'

const moduleName = 'UIServiceWorkerBroadcastChannel'

interface Responses {
  responses: BroadcastChannelResponsePayload[]
  responsesExpected: number
  responsesReceived: number
}

export class UIServiceWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly responses: Map<string, Responses>
  private readonly uiService: AbstractUIService

  constructor (uiService: AbstractUIService) {
    super()
    this.uiService = uiService
    this.onmessage = this.responseHandler.bind(this) as (message: unknown) => void
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: unknown) => void
    this.responses = new Map<string, Responses>()
  }

  private buildResponsePayload (uuid: string): ResponsePayload {
    const responsesStatus =
      this.responses
        .get(uuid)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        ?.responses.every(response => response?.status === ResponseStatus.SUCCESS) === true
        ? ResponseStatus.SUCCESS
        : ResponseStatus.FAILURE
    return {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
      hashIdsSucceeded: this.responses
        .get(uuid)
        ?.responses.map(response => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (response?.hashId != null && response?.status === ResponseStatus.SUCCESS) {
            return response.hashId
          }
          return undefined
        })
        .filter(hashId => hashId != null)!,
      status: responsesStatus,
      ...(responsesStatus === ResponseStatus.FAILURE && {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
        hashIdsFailed: this.responses
          .get(uuid)
          ?.responses.map(response => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (response?.hashId != null && response?.status === ResponseStatus.FAILURE) {
              return response.hashId
            }
            return undefined
          })
          .filter(hashId => hashId != null)!,
      }),
      ...(responsesStatus === ResponseStatus.FAILURE && {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
        responsesFailed: this.responses
          .get(uuid)
          ?.responses.map(response => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (response?.status === ResponseStatus.FAILURE) {
              return response
            }
            return undefined
          })
          .filter(response => response != null)!,
      }),
    }
  }

  private messageErrorHandler (messageEvent: MessageEvent): void {
    logger.error(
      `${this.uiService.logPrefix(moduleName, 'messageErrorHandler')} Error at handling message:`,
      messageEvent
    )
  }

  private responseHandler (messageEvent: MessageEvent): void {
    const validatedMessageEvent = this.validateMessageEvent(messageEvent)
    if (validatedMessageEvent === false) {
      return
    }
    if (this.isRequest(validatedMessageEvent.data)) {
      return
    }
    const [uuid, responsePayload] = validatedMessageEvent.data as BroadcastChannelResponse
    if (!this.responses.has(uuid)) {
      this.responses.set(uuid, {
        responses: [responsePayload],
        responsesExpected: this.uiService.getBroadcastChannelExpectedResponses(uuid),
        responsesReceived: 1,
      })
    } else if (
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.responses.get(uuid)!.responsesReceived <= this.responses.get(uuid)!.responsesExpected
    ) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      ++this.responses.get(uuid)!.responsesReceived
      this.responses.get(uuid)?.responses.push(responsePayload)
    }
    if (
      this.responses.get(uuid)?.responsesReceived === this.responses.get(uuid)?.responsesExpected
    ) {
      this.uiService.sendResponse(uuid, this.buildResponsePayload(uuid))
      this.responses.delete(uuid)
      this.uiService.deleteBroadcastChannelRequest(uuid)
    }
  }
}
