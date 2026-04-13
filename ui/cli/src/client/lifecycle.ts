import type { ProcedureName, RequestPayload, ResponsePayload, UIServerConfig } from 'ui-common'
import type { WebSocketFactory, WebSocketLike } from 'ui-common'

import process from 'node:process'
import ora from 'ora'
import { WebSocketClient } from 'ui-common'
import { WebSocket as WsWebSocket } from 'ws'

import type { Formatter } from '../output/formatter.js'

import { ConnectionError } from './errors.js'

const createWsFactory = (): WebSocketFactory => {
  return (url: string, protocols: string | string[]): WebSocketLike => {
    const ws = new WsWebSocket(url, protocols)
    return ws as unknown as WebSocketLike
  }
}

export interface ExecuteOptions {
  config: UIServerConfig
  formatter: Formatter
  payload: RequestPayload
  procedureName: ProcedureName
  timeoutMs?: number
}

export const executeCommand = async (options: ExecuteOptions): Promise<void> => {
  const { config, formatter, payload, procedureName, timeoutMs } = options

  const url = `${config.secure ? 'wss' : 'ws'}://${config.host}:${config.port.toString()}`

  const isInteractive = process.stderr.isTTY
  const spinner = isInteractive
    ? ora({ stream: process.stderr }).start(`Connecting to ${url}`)
    : null

  const factory = createWsFactory()
  const client = new WebSocketClient(factory, config, timeoutMs)

  try {
    await client.connect()
    if (spinner != null) {
      spinner.text = `Sending ${procedureName}...`
    }

    const response: ResponsePayload = await client.sendRequest(procedureName, payload)
    spinner?.stop()

    formatter.output(response)
  } catch (error: unknown) {
    spinner?.fail()
    if (error instanceof Error && error.message.includes('connect')) {
      throw new ConnectionError(url, error)
    }
    throw error
  } finally {
    client.disconnect()
  }
}

export const registerSignalHandlers = (client?: { disconnect: () => void }): void => {
  const cleanup = (code: number): void => {
    if (process.stderr.isTTY) {
      process.stderr.write('\u001b[?25h')
    }
    client?.disconnect()
    process.exit(code)
  }

  process.on('SIGINT', () => {
    cleanup(130)
  })
  process.on('SIGTERM', () => {
    cleanup(143)
  })
}
