import type { IncomingMessage, ServerResponse } from 'node:http'

import { StatusCodes } from 'http-status-codes'

import { BaseError } from '../../exception/index.js'
import {
  ApplicationProtocolVersion,
  MapStringifyFormat,
  type ProcedureName,
  type Protocol,
  type ProtocolRequest,
  type ProtocolResponse,
  type ProtocolVersion,
  type RequestPayload,
  ResponseStatus,
  type UIServerConfiguration,
} from '../../types/index.js'
import {
  Constants,
  generateUUID,
  isNotEmptyString,
  JSONStringify,
  logger,
  logPrefix,
} from '../../utils/index.js'
import { AbstractUIServer } from './AbstractUIServer.js'
import { isProtocolAndVersionSupported } from './UIServerUtils.js'

const moduleName = 'UIHttpServer'

enum HttpMethods {
  GET = 'GET',
  PATCH = 'PATCH',
  POST = 'POST',
  PUT = 'PUT',
}

export class UIHttpServer extends AbstractUIServer {
  public logPrefix = (modName?: string, methodName?: string, prefixSuffix?: string): string => {
    const logMsgPrefix = prefixSuffix != null ? `UI HTTP Server ${prefixSuffix}` : 'UI HTTP Server'
    const logMsg =
      isNotEmptyString(modName) && isNotEmptyString(methodName)
        ? ` ${logMsgPrefix} | ${modName}.${methodName}:`
        : ` ${logMsgPrefix} |`
    return logPrefix(logMsg)
  }

  public constructor (protected readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration)
  }

  private requestListener (req: IncomingMessage, res: ServerResponse): void {
    this.authenticate(req, err => {
      if (err != null) {
        res
          .writeHead(StatusCodes.UNAUTHORIZED, {
            'Content-Type': 'text/plain',
            'WWW-Authenticate': 'Basic realm=users',
          })
          .end(`${StatusCodes.UNAUTHORIZED.toString()} Unauthorized`)
        res.destroy()
        req.destroy()
      }
    })
    // Expected request URL pathname: /ui/:version/:procedureName
    const [protocol, version, procedureName] = req.url?.split('/').slice(1) as [
      Protocol,
      ProtocolVersion,
      ProcedureName
    ]
    const uuid = generateUUID()
    this.responseHandlers.set(uuid, res)
    try {
      const fullProtocol = `${protocol}${version}`
      if (!isProtocolAndVersionSupported(fullProtocol)) {
        throw new BaseError(`Unsupported UI protocol version: '${fullProtocol}'`)
      }
      this.registerProtocolVersionUIService(version)
      req.on('error', error => {
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener.req.onerror')} Error on HTTP request:`,
          error
        )
      })
      if (req.method === HttpMethods.POST) {
        const bodyBuffer: Uint8Array[] = []
        req
          .on('data', (chunk: Uint8Array) => {
            bodyBuffer.push(chunk)
          })
          .on('end', () => {
            let requestPayload: RequestPayload | undefined
            try {
              requestPayload = JSON.parse(Buffer.concat(bodyBuffer).toString()) as RequestPayload
            } catch (error) {
              this.sendResponse(
                this.buildProtocolResponse(uuid, {
                  errorMessage: (error as Error).message,
                  errorStack: (error as Error).stack,
                  status: ResponseStatus.FAILURE,
                })
              )
              return
            }
            this.uiServices
              .get(version)
              ?.requestHandler(this.buildProtocolRequest(uuid, procedureName, requestPayload))
              .then((protocolResponse?: ProtocolResponse) => {
                if (protocolResponse != null) {
                  this.sendResponse(protocolResponse)
                }
                return undefined
              })
              .catch(Constants.EMPTY_FUNCTION)
          })
      } else {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`Unsupported HTTP method: '${req.method}'`)
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'requestListener')} Handle HTTP request error:`,
        error
      )
      this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
    }
  }

  private responseStatusToStatusCode (status: ResponseStatus): StatusCodes {
    switch (status) {
      case ResponseStatus.FAILURE:
        return StatusCodes.BAD_REQUEST
      case ResponseStatus.SUCCESS:
        return StatusCodes.OK
      default:
        return StatusCodes.INTERNAL_SERVER_ERROR
    }
  }

  public sendRequest (request: ProtocolRequest): void {
    switch (this.uiServerConfiguration.version) {
      case ApplicationProtocolVersion.VERSION_20:
        this.httpServer.emit('request', request)
        break
    }
  }

  public sendResponse (response: ProtocolResponse): void {
    const [uuid, payload] = response
    try {
      if (this.hasResponseHandler(uuid)) {
        const res = this.responseHandlers.get(uuid) as ServerResponse
        res
          .writeHead(this.responseStatusToStatusCode(payload.status), {
            'Content-Type': 'application/json',
          })
          .end(JSONStringify(payload, undefined, MapStringifyFormat.object))
      } else {
        logger.error(
          `${this.logPrefix(moduleName, 'sendResponse')} Response for unknown request id: ${uuid}`
        )
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'sendResponse')} Error at sending response id '${uuid}':`,
        error
      )
    } finally {
      this.responseHandlers.delete(uuid)
    }
  }

  public start (): void {
    this.httpServer.on('request', this.requestListener.bind(this))
    this.startHttpServer()
  }
}
