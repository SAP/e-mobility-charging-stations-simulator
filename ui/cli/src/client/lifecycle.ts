import process from 'node:process'
import ora from 'ora'
import {
  type ProcedureName,
  type RequestPayload,
  type ResponsePayload,
  UI_WEBSOCKET_REQUEST_TIMEOUT_MS,
  type UIServerConfig,
  WebSocketClient,
  type WebSocketFactory,
  type WebSocketLike,
} from 'ui-common'
import { WebSocket as WsWebSocket } from 'ws'

import type { Formatter } from '../output/formatter.js'

import { ConnectionError } from './errors.js'

const createWsFactory = (): WebSocketFactory => {
  return (url: string, protocols: string | string[]): WebSocketLike => {
    const ws = new WsWebSocket(url, protocols)
    return ws as unknown as WebSocketLike
  }
}

let activeClient: undefined | WebSocketClient
let activeSpinner: ReturnType<typeof ora> | undefined
let cleanupInProgress = false

export interface ExecuteOptions {
  config: UIServerConfig
  formatter: Formatter
  payload: RequestPayload
  procedureName: ProcedureName
  timeoutMs?: number
}

export const executeCommand = async (options: ExecuteOptions): Promise<void> => {
  const { config, formatter, payload, procedureName, timeoutMs } = options

  const factory = createWsFactory()
  const client = new WebSocketClient(factory, config, timeoutMs)
  const { url } = client

  const isInteractive = process.stderr.isTTY
  const spinner = isInteractive
    ? ora({ stream: process.stderr }).start(`Connecting to ${url}`)
    : null

  activeSpinner = spinner ?? undefined
  activeClient = client

  const budget = timeoutMs ?? UI_WEBSOCKET_REQUEST_TIMEOUT_MS
  const startTime = Date.now()

  let connectTimeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const connectPromise = client.connect()
    connectPromise.catch(() => undefined)
    await Promise.race([
      connectPromise,
      new Promise<never>((_resolve, reject) => {
        connectTimeoutId = setTimeout(() => {
          reject(new Error(`Connection to ${url} timed out`))
        }, budget)
      }),
    ])
  } catch (error: unknown) {
    spinner?.fail()
    client.disconnect()
    throw new ConnectionError(url, error)
  } finally {
    clearTimeout(connectTimeoutId)
  }

  const remaining = budget - (Date.now() - startTime)
  if (remaining <= 0) {
    spinner?.fail()
    client.disconnect()
    throw new ConnectionError(url, new Error('Connection consumed entire timeout budget'))
  }

  try {
    if (spinner != null) {
      spinner.text = `Sending ${procedureName}...`
    }
    const response: ResponsePayload = await client.sendRequest(procedureName, payload, remaining)
    spinner?.stop()
    formatter.output(response)
  } catch (error: unknown) {
    spinner?.fail()
    throw error
  } finally {
    activeClient = undefined
    activeSpinner = undefined
    client.disconnect()
  }
}

export const registerSignalHandlers = (): void => {
  const cleanup = (code: number): void => {
    if (cleanupInProgress) return
    cleanupInProgress = true
    activeSpinner?.stop()
    activeClient?.disconnect()

    process.exit(code)
  }

  process.on('SIGINT', () => {
    cleanup(130)
  })
  process.on('SIGTERM', () => {
    cleanup(143)
  })
}
