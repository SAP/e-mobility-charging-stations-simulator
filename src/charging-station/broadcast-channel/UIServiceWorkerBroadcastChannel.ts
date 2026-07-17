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

export class UIServiceWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly responses: Map<UUIDv4, BroadcastChannelResponsePayload[]>
  private readonly uiService: AbstractUIService

  constructor (uiService: AbstractUIService) {
    super()
    this.uiService = uiService
    this.onmessage = this.responseHandler.bind(this) as (message: unknown) => void
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: unknown) => void
    this.responses = new Map<UUIDv4, BroadcastChannelResponsePayload[]>()
  }

  /**
   * Completes a broadcast request whose safety-net timeout fired before all
   * expected worker responses arrived (e.g. a targeted station was deleted
   * mid-flight), so the caller is not left waiting forever, then releases the
   * aggregation state.
   * @param uuid - Request identifier.
   */
  public completeExpiredRequest (uuid: UUIDv4): void {
    if (this.uiService.getBroadcastChannelOutstandingResponseCount(uuid) === 0) {
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

  /**
   * Completes a broadcast request whose last outstanding responder was a
   * station deleted mid-flight: the surviving stations have all replied, so
   * the request is completed with the truthful aggregated payload (the deleted
   * station simply absent) instead of hanging.
   * @param uuid - Request identifier.
   */
  public completeReconciledRequest (uuid: UUIDv4): void {
    this.completeRequest(uuid)
  }

  private buildResponsePayload (uuid: UUIDv4): ResponsePayload {
    const responsesArray = this.responses.get(uuid) ?? []
    const responsesStatus =
      isNotEmptyArray(responsesArray) &&
      responsesArray.every(response => response.status === ResponseStatus.SUCCESS)
        ? ResponseStatus.SUCCESS
        : ResponseStatus.FAILURE
    return {
      hashIdsSucceeded: responsesArray
        .map(response => {
          if (response.hashId != null && response.status === ResponseStatus.SUCCESS) {
            return response.hashId
          }
          return undefined
        })
        .filter((hashId): hashId is string => hashId != null),
      status: responsesStatus,
      ...(responsesStatus === ResponseStatus.FAILURE && {
        hashIdsFailed: responsesArray
          .map(response => {
            if (response.hashId != null && response.status === ResponseStatus.FAILURE) {
              return response.hashId
            }
            return undefined
          })
          .filter((hashId): hashId is string => hashId != null),
      }),
      ...(responsesStatus === ResponseStatus.FAILURE && {
        responsesFailed: responsesArray
          .map(response => {
            if (response.status === ResponseStatus.FAILURE) {
              return response
            }
            return undefined
          })
          .filter((response): response is BroadcastChannelResponsePayload => response != null),
      }),
    }
  }

  private buildTimeoutResponsePayload (uuid: UUIDv4): ResponsePayload {
    const responsesArray = this.responses.get(uuid) ?? []
    const responsesReceived = responsesArray.length
    const responsesExpected =
      responsesReceived + this.uiService.getBroadcastChannelOutstandingResponseCount(uuid)
    return {
      errorMessage: `Timed out waiting for charging station responses (received ${responsesReceived.toString()} of ${responsesExpected.toString()})`,
      hashIdsSucceeded: responsesArray
        .filter(response => response.status === ResponseStatus.SUCCESS)
        .map(response => response.hashId)
        .filter((hashId): hashId is string => hashId != null),
      status: ResponseStatus.FAILURE,
    }
  }

  private completeRequest (uuid: UUIDv4): void {
    // Always release aggregation state, even if downstream sendResponse throws.
    try {
      this.uiService.sendResponse(uuid, this.buildResponsePayload(uuid))
    } finally {
      this.responses.delete(uuid)
      this.uiService.deleteBroadcastChannelRequest(uuid)
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
    const outcome = this.uiService.recordBroadcastChannelResponse(uuid, responsePayload.hashId)
    if (outcome === 'untracked') {
      if (
        responsePayload.hashId == null &&
        this.uiService.getBroadcastChannelOutstandingResponseCount(uuid) > 0
      ) {
        // Reply for a still-tracked request but without a hashId, so it cannot
        // be matched to an outstanding responder; completion is left to the
        // remaining replies and the safety-net timeout. Logged distinctly from a
        // late/duplicate drop to make such a stall diagnosable.
        logger.debug(
          `${this.uiService.logPrefix(moduleName, 'responseHandler')} Dropping broadcast response without hashId for a tracked request:`,
          { responsePayload, uuid }
        )
        return
      }
      // Late, duplicate or reconciled-away reply for an already-released or
      // unexpected station: drop it so it cannot re-complete the request.
      logger.debug(
        `${this.uiService.logPrefix(moduleName, 'responseHandler')} Dropping untracked broadcast response:`,
        { responsePayload, uuid }
      )
      return
    }
    const responses = this.responses.get(uuid)
    if (responses == null) {
      this.responses.set(uuid, [responsePayload])
    } else {
      responses.push(responsePayload)
    }
    if (outcome === 'completed') {
      this.completeRequest(uuid)
    }
  }
}
