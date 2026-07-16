// Type-only edge, erased at compile time. A value import through this barrel
// would pull `UIHttpServer` / `UIMCPServer` / `UIServiceFactory` transitively
// and close a runtime cycle.
import type { AbstractUIService } from '../ui-server/index.js'

import {
  type BroadcastChannelResponse,
  type BroadcastChannelResponsePayload,
  type MessageEvent,
  type ResponsePayload,
  ResponseStatus,
  type UUIDv4,
} from '../../types/index.js'
import { isNotEmptyArray, logger } from '../../utils/index.js'
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

  /**
   * Completes a broadcast request whose safety-net timeout fired before all
   * expected worker responses arrived (e.g. a targeted station was deleted
   * mid-flight), so the caller is not left waiting forever, then releases the
   * aggregation state. See issue #2018.
   * @param uuid - Request identifier.
   */
  public completeExpiredRequest (uuid: UUIDv4): void {
    if (this.uiService.getBroadcastChannelExpectedResponses(uuid) === 0) {
      // Already completed and released by the normal response path.
      return
    }
    try {
      this.uiService.sendResponse(uuid, this.buildTimeoutResponsePayload(uuid))
    } finally {
      this.responses.delete(uuid)
      this.uiService.deleteBroadcastChannelRequest(uuid)
    }
  }

  private buildResponsePayload (uuid: string): ResponsePayload {
    const responsesArray = this.responses.get(uuid)?.responses ?? []
    const responsesStatus =
      isNotEmptyArray(responsesArray) &&
      responsesArray.every(response => response.status === ResponseStatus.SUCCESS)
        ? ResponseStatus.SUCCESS
        : ResponseStatus.FAILURE
    return {
      hashIdsSucceeded: responsesArray
        .map(response => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (response?.hashId != null && response?.status === ResponseStatus.SUCCESS) {
            return response.hashId
          }
          return undefined
        })
        .filter((hashId): hashId is string => hashId != null),
      status: responsesStatus,
      ...(responsesStatus === ResponseStatus.FAILURE && {
        hashIdsFailed: responsesArray
          .map(response => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (response?.hashId != null && response?.status === ResponseStatus.FAILURE) {
              return response.hashId
            }
            return undefined
          })
          .filter((hashId): hashId is string => hashId != null),
      }),
      ...(responsesStatus === ResponseStatus.FAILURE && {
        responsesFailed: responsesArray
          .map(response => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (response?.status === ResponseStatus.FAILURE) {
              return response
            }
            return undefined
          })
          .filter((response): response is BroadcastChannelResponsePayload => response != null),
      }),
    }
  }

  private buildTimeoutResponsePayload (uuid: UUIDv4): ResponsePayload {
    const responses = this.responses.get(uuid)
    const responsesReceived = responses?.responsesReceived ?? 0
    const responsesExpected =
      responses?.responsesExpected ?? this.uiService.getBroadcastChannelExpectedResponses(uuid)
    return {
      errorMessage: `Timed out waiting for charging station responses (received ${responsesReceived.toString()} of ${responsesExpected.toString()})`,
      hashIdsSucceeded: (responses?.responses ?? [])
        .filter(response => response.status === ResponseStatus.SUCCESS)
        .map(response => response.hashId)
        .filter((hashId): hashId is string => hashId != null),
      status: ResponseStatus.FAILURE,
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
    } else {
      const responses = this.responses.get(uuid)
      if (responses != null) {
        if (responses.responsesReceived < responses.responsesExpected) {
          ++responses.responsesReceived
          responses.responses.push(responsePayload)
        } else {
          logger.debug(
            `${this.uiService.logPrefix(moduleName, 'responseHandler')} Received response after all expected responses:`,
            { responsePayload, uuid }
          )
        }
      }
    }
    const responses = this.responses.get(uuid)
    if (responses != null && responses.responsesReceived >= responses.responsesExpected) {
      // Always release aggregation state, even if downstream sendResponse throws.
      try {
        this.uiService.sendResponse(uuid, this.buildResponsePayload(uuid))
      } finally {
        this.responses.delete(uuid)
        this.uiService.deleteBroadcastChannelRequest(uuid)
      }
    }
  }
}
