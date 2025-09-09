import { BroadcastChannel } from 'node:worker_threads'

import type {
  BroadcastChannelRequest,
  BroadcastChannelResponse,
  JsonType,
  MessageEvent,
} from '../../types/index.js'

import { logger, logPrefix, validateUUID } from '../../utils/index.js'

const moduleName = 'WorkerBroadcastChannel'

export abstract class WorkerBroadcastChannel extends BroadcastChannel {
  protected constructor () {
    super('worker')
  }

  public sendRequest (request: BroadcastChannelRequest): void {
    this.postMessage(request)
  }

  protected isRequest (message: JsonType[]): boolean {
    return Array.isArray(message) && message.length === 3
  }

  protected isResponse (message: JsonType[]): boolean {
    return Array.isArray(message) && message.length === 2
  }

  protected sendResponse (response: BroadcastChannelResponse): void {
    this.postMessage(response)
  }

  protected validateMessageEvent (messageEvent: MessageEvent): false | MessageEvent {
    const data = messageEvent.data
    if (!Array.isArray(data)) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateMessageEvent'
        )} Worker broadcast channel protocol message event data is not an array`
      )
      return false
    }
    if (!validateUUID(data[0])) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateMessageEvent'
        )} Worker broadcast channel protocol message event data UUID field is invalid`
      )
      return false
    }
    return messageEvent
  }

  private readonly logPrefix = (modName: string, methodName: string): string => {
    return logPrefix(` Worker Broadcast Channel | ${modName}.${methodName}:`)
  }
}
