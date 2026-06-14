import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

import { getReasonPhrase, StatusCodes } from 'http-status-codes'
import { type RawData, WebSocket, WebSocketServer } from 'ws'

import type { IBootstrap } from '../IBootstrap.js'

import {
  MapStringifyFormat,
  type ProtocolNotification,
  type ProtocolRequest,
  type ProtocolResponse,
  ServerNotification,
  type UIServerConfiguration,
  WebSocketCloseEventStatusCode,
} from '../../types/index.js'
import {
  getWebSocketCloseEventStatusString,
  JSONStringify,
  logger,
  validateUUID,
} from '../../utils/index.js'
import { AbstractUIServer } from './AbstractUIServer.js'
import {
  DEFAULT_COMPRESSION_THRESHOLD_BYTES,
  DEFAULT_MAX_PAYLOAD_SIZE_BYTES,
} from './UIServerSecurity.js'
import {
  getProtocolAndVersion,
  handleProtocols,
  isProtocolAndVersionSupported,
} from './UIServerUtils.js'

const moduleName = 'UIWebSocketServer'

// Pre-handshake WS rejections write raw HTTP/1.1 to the Duplex socket;
// AbstractUIServer.renderDenial targets ServerResponse and is not applicable.
const buildUpgradeRejectionResponse = (
  status: StatusCodes,
  reasonPhrase: string,
  extraHeaders: Readonly<Record<string, string>> = {}
): string => {
  const headers: Readonly<Record<string, string>> = {
    'Content-Length': '0',
    ...extraHeaders,
    Connection: 'close',
  }
  const headerLines = Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n')
  return `HTTP/1.1 ${status.toString()} ${reasonPhrase}\r\n${headerLines}\r\n\r\n`
}

export class UIWebSocketServer extends AbstractUIServer {
  protected override readonly uiServerType = 'UI WebSocket Server'

  private readonly webSocketServer: WebSocketServer

  public constructor (
    protected override readonly uiServerConfiguration: UIServerConfiguration,
    bootstrap: IBootstrap
  ) {
    super(uiServerConfiguration, bootstrap)
    this.webSocketServer = new WebSocketServer({
      handleProtocols,
      maxPayload: DEFAULT_MAX_PAYLOAD_SIZE_BYTES,
      noServer: true,
      perMessageDeflate: {
        clientNoContextTakeover: true,
        concurrencyLimit: 10,
        serverMaxWindowBits: 12,
        serverNoContextTakeover: true,
        threshold: DEFAULT_COMPRESSION_THRESHOLD_BYTES,
        zlibDeflateOptions: {
          chunkSize: 16 * 1024,
          level: 6,
          memLevel: 7,
        },
        zlibInflateOptions: {
          chunkSize: 16 * 1024,
        },
      },
    })
  }

  public sendRequest (request: ProtocolRequest): void {
    this.broadcastToClients(JSON.stringify(request))
  }

  public sendResponse (response: ProtocolResponse): void {
    const responseId = response[0]
    try {
      if (this.hasResponseHandler(responseId)) {
        const ws = this.responseHandlers.get(responseId) as WebSocket
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSONStringify(response, undefined, MapStringifyFormat.object))
        } else {
          logger.error(
            `${this.logPrefix(
              moduleName,
              'sendResponse'
            )} Error at sending response id '${responseId}', WebSocket is not open: ${ws.readyState.toString()}`
          )
        }
      } else {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'sendResponse'
          )} Response for unknown request id: ${responseId}`
        )
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'sendResponse'
        )} Error at sending response id '${responseId}':`,
        error
      )
    } finally {
      this.responseHandlers.delete(responseId)
    }
  }

  public start (): void {
    this.webSocketServer.on('connection', (ws: WebSocket, _req: IncomingMessage): void => {
      const protocol = ws.protocol
      const protocolAndVersion = getProtocolAndVersion(protocol)
      if (protocolAndVersion == null || !isProtocolAndVersionSupported(protocol)) {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.server.onconnection'
          )} Unsupported UI protocol version: '${protocol}'`
        )
        ws.close(WebSocketCloseEventStatusCode.CLOSE_PROTOCOL_ERROR)
        return
      }
      const [, version] = protocolAndVersion
      this.registerProtocolVersionUIService(version)
      ws.on('message', rawData => {
        const request = this.validateRawDataRequest(rawData)
        if (request === false) {
          ws.close(WebSocketCloseEventStatusCode.CLOSE_INVALID_PAYLOAD)
          return
        }
        const [requestId] = request
        this.responseHandlers.set(requestId, ws)
        this.uiServices
          .get(version)
          ?.requestHandler(request)
          .then((protocolResponse?: ProtocolResponse) => {
            if (protocolResponse != null) {
              this.sendResponse(protocolResponse)
            }
            return undefined
          })
          .catch((error: unknown) => {
            logger.error(
              `${this.logPrefix(moduleName, 'start.ws.onmessage')} Request handler error:`,
              error
            )
            this.responseHandlers.delete(requestId)
          })
      })
      ws.on('error', error => {
        logger.error(`${this.logPrefix(moduleName, 'start.ws.onerror')} WebSocket error:`, error)
      })
      ws.on('close', (code, reason) => {
        logger.debug(
          `${this.logPrefix(
            moduleName,
            'start.ws.onclose'
          )} WebSocket closed: '${getWebSocketCloseEventStatusString(
            code
          )}' - '${reason.toString()}'`
        )
        for (const [responseId, responseHandlerWs] of this.responseHandlers) {
          if (responseHandlerWs === ws) this.responseHandlers.delete(responseId)
        }
      })
    })
    this.httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
      const onSocketError = (error: Error): void => {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.httpServer.on.upgrade'
          )} Socket error at connection upgrade event handling:`,
          error
        )
      }
      socket.on('error', onSocketError)

      const connectionHeader = req.headers.connection ?? ''
      const upgradeHeader = req.headers.upgrade ?? ''
      if (!/upgrade/i.test(connectionHeader) || !/^websocket$/i.test(upgradeHeader)) {
        socket.write(
          buildUpgradeRejectionResponse(
            StatusCodes.BAD_REQUEST,
            getReasonPhrase(StatusCodes.BAD_REQUEST)
          ),
          () => {
            socket.destroy()
          }
        )
        return
      }

      const prologue = this.runRequestPrologue(req)
      if (!prologue.ok) {
        socket.write(
          buildUpgradeRejectionResponse(prologue.status, prologue.reasonPhrase, prologue.headers),
          () => {
            socket.destroy()
          }
        )
        return
      }

      if (!this.authenticate(req)) {
        const unauthorized = this.getUnauthorizedDenial()
        socket.write(
          buildUpgradeRejectionResponse(
            unauthorized.status,
            unauthorized.reasonPhrase,
            unauthorized.headers
          ),
          () => {
            socket.destroy()
          }
        )
        return
      }
      socket.removeListener('error', onSocketError)
      try {
        this.webSocketServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          this.webSocketServer.emit('connection', ws, req)
        })
      } catch (error) {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.httpServer.on.upgrade'
          )} Error at connection upgrade event handling:`,
          error
        )
      }
    })
    this.startHttpServer()
  }

  protected override notifyClients (): void {
    const notification: ProtocolNotification = [ServerNotification.REFRESH]
    this.broadcastToClients(JSON.stringify(notification))
  }

  private broadcastToClients (message: string): void {
    for (const client of this.webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  }

  private validateRawDataRequest (rawData: RawData): false | ProtocolRequest {
    // logger.debug(
    //   `${this.logPrefix(
    //     moduleName,
    //     'validateRawDataRequest'
    //     // eslint-disable-next-line @typescript-eslint/no-base-to-string
    //   )} Raw data received in string format: ${rawData.toString()}`
    // )

    let request: ProtocolRequest
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      request = JSON.parse(rawData.toString()) as ProtocolRequest
    } catch (error) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
        )} UI protocol request is not valid JSON: ${rawData.toString()}`
      )
      return false
    }

    if (!Array.isArray(request)) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request is not an array:`,
        request
      )
      return false
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (request.length !== 3) {
      logger.error(
        `${this.logPrefix(moduleName, 'validateRawDataRequest')} UI protocol request is malformed:`,
        request
      )
      return false
    }

    if (!validateUUID(request[0])) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request UUID field is invalid:`,
        request
      )
      return false
    }

    if (typeof request[1] !== 'string') {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request procedure field must be a string:`,
        request
      )
      return false
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!(typeof request[2] === 'object' && request[2] !== null)) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request payload field must be an object or an array:`,
        request
      )
      return false
    }

    return request
  }
}
