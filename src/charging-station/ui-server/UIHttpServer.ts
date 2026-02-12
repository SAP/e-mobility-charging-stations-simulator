import type { IncomingMessage, ServerResponse } from 'node:http'

import { StatusCodes } from 'http-status-codes'
import { createGzip } from 'node:zlib'

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
  type UUIDv4,
} from '../../types/index.js'
import {
  generateUUID,
  isNotEmptyString,
  JSONStringify,
  logger,
  logPrefix,
} from '../../utils/index.js'
import { AbstractUIServer } from './AbstractUIServer.js'
import {
  createBodySizeLimiter,
  createRateLimiter,
  DEFAULT_COMPRESSION_THRESHOLD,
  DEFAULT_MAX_PAYLOAD_SIZE,
  DEFAULT_RATE_LIMIT,
  DEFAULT_RATE_WINDOW,
} from './UIServerSecurity.js'
import { isProtocolAndVersionSupported } from './UIServerUtils.js'

const moduleName = 'UIHttpServer'

const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, DEFAULT_RATE_WINDOW)

enum HttpMethods {
  GET = 'GET',
  PATCH = 'PATCH',
  POST = 'POST',
  PUT = 'PUT',
}

export class UIHttpServer extends AbstractUIServer {
  private readonly acceptsGzip: Map<UUIDv4, boolean>

  public constructor (protected override readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration)
    this.acceptsGzip = new Map<UUIDv4, boolean>()
  }

  public logPrefix = (modName?: string, methodName?: string, prefixSuffix?: string): string => {
    const logMsgPrefix = prefixSuffix != null ? `UI HTTP Server ${prefixSuffix}` : 'UI HTTP Server'
    const logMsg =
      isNotEmptyString(modName) && isNotEmptyString(methodName)
        ? ` ${logMsgPrefix} | ${modName}.${methodName}:`
        : ` ${logMsgPrefix} |`
    return logPrefix(logMsg)
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
        const body = JSONStringify(payload, undefined, MapStringifyFormat.object)
        const shouldCompress =
          this.acceptsGzip.get(uuid) === true &&
          Buffer.byteLength(body) >= DEFAULT_COMPRESSION_THRESHOLD

        if (shouldCompress) {
          res.writeHead(this.responseStatusToStatusCode(payload.status), {
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/json',
            Vary: 'Accept-Encoding',
          })
          const gzip = createGzip()
          gzip.pipe(res)
          gzip.end(body)
        } else {
          res
            .writeHead(this.responseStatusToStatusCode(payload.status), {
              'Content-Type': 'application/json',
            })
            .end(body)
        }
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
      this.acceptsGzip.delete(uuid)
    }
  }

  public start (): void {
    this.httpServer.on('request', this.requestListener.bind(this))
    this.startHttpServer()
  }

  private requestListener (req: IncomingMessage, res: ServerResponse): void {
    // Rate limiting check
    const clientIp = req.socket.remoteAddress ?? 'unknown'
    if (!rateLimiter(clientIp)) {
      res
        .writeHead(StatusCodes.TOO_MANY_REQUESTS, {
          'Content-Type': 'text/plain',
          'Retry-After': '60',
        })
        .end(`${StatusCodes.TOO_MANY_REQUESTS.toString()} Too Many Requests`)
      res.destroy()
      req.destroy()
      return
    }

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
        return
      }

      const uuid = generateUUID()
      this.responseHandlers.set(uuid, res)
      const acceptEncoding = req.headers['accept-encoding'] ?? ''
      this.acceptsGzip.set(uuid, /\bgzip\b/.test(acceptEncoding))
      res.on('close', () => {
        this.responseHandlers.delete(uuid)
        this.acceptsGzip.delete(uuid)
      })
      try {
        // Expected request URL pathname: /ui/:version/:procedureName
        const rawUrl = req.url ?? ''
        const { pathname } = new URL(rawUrl, 'http://localhost')
        const parts = pathname.split('/').filter(Boolean)
        if (parts.length < 3) {
          throw new BaseError(
            `Malformed URL path: '${pathname}' (expected /ui/:version/:procedureName)`
          )
        }
        const [protocol, version, procedureName] = parts as [
          Protocol,
          ProtocolVersion,
          ProcedureName
        ]
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
          if (!res.headersSent) {
            this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
          } else {
            this.responseHandlers.delete(uuid)
          }
        })

        if (req.method !== HttpMethods.POST) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw new BaseError(`Unsupported HTTP method: '${req.method}'`)
        }

        const bodyBuffer: Uint8Array[] = []
        const checkBodySize = createBodySizeLimiter(DEFAULT_MAX_PAYLOAD_SIZE)
        req
          .on('data', (chunk: Uint8Array) => {
            if (!checkBodySize(chunk.length)) {
              res
                .writeHead(StatusCodes.REQUEST_TOO_LONG, {
                  'Content-Type': 'text/plain',
                })
                .end(`${StatusCodes.REQUEST_TOO_LONG.toString()} Payload Too Large`)
              res.destroy()
              req.destroy()
              return
            }
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
            const service = this.uiServices.get(version)
            if (service == null || typeof service.requestHandler !== 'function') {
              this.sendResponse(
                this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE })
              )
              return
            }
            // eslint-disable-next-line promise/no-promise-in-callback
            service
              .requestHandler(this.buildProtocolRequest(uuid, procedureName, requestPayload))
              .then((protocolResponse?: ProtocolResponse) => {
                if (protocolResponse != null) {
                  this.sendResponse(protocolResponse)
                } else {
                  this.sendResponse(
                    this.buildProtocolResponse(uuid, { status: ResponseStatus.SUCCESS })
                  )
                }
                return undefined
              })
              .catch((error: unknown) => {
                logger.error(
                  `${this.logPrefix(moduleName, 'requestListener.service.requestHandler')} UI service request handler error:`,
                  error
                )
                this.sendResponse(
                  this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE })
                )
              })
          })
      } catch (error) {
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener')} Handle HTTP request error:`,
          error
        )
        this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }))
      }
    })
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
}
