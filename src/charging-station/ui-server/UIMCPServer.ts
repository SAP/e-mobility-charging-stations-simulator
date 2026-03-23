import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AbstractUIService } from './ui-services/AbstractUIService.js'

import { BaseError } from '../../exception/index.js'
import {
  OCPPVersion,
  type ProcedureName,
  type ProtocolRequest,
  type ProtocolResponse,
  ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
  type UIServerConfiguration,
  type UUIDv4,
} from '../../types/index.js'
import { generateUUID, logger } from '../../utils/index.js'
import { AbstractUIServer } from './AbstractUIServer.js'
import {
  mcpToolSchemas,
  ocppSchemaMapping,
  registerMCPLogTools,
  registerMCPResources,
  registerMCPSchemaResources,
} from './mcp/index.js'
import {
  createBodySizeLimiter,
  createRateLimiter,
  DEFAULT_MAX_PAYLOAD_SIZE,
  DEFAULT_RATE_LIMIT,
  DEFAULT_RATE_WINDOW,
} from './UIServerSecurity.js'
import { HttpMethod } from './UIServerUtils.js'

const moduleName = 'UIMCPServer'

const MCP_TOOL_TIMEOUT_MS = 30_000

const rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT, DEFAULT_RATE_WINDOW)

export class UIMCPServer extends AbstractUIServer {
  protected override readonly uiServerType = 'UI MCP Server'

  private readonly pendingMcpRequests: Map<
    UUIDv4,
    {
      reject: (error: Error) => void
      resolve: (payload: ResponsePayload) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >

  public constructor (protected override readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration)
    this.pendingMcpRequests = new Map()
  }

  private static createToolErrorResponse (error: string): CallToolResult {
    return {
      content: [{ text: JSON.stringify({ error, status: 'failure' }), type: 'text' as const }],
      isError: true,
    }
  }

  private static createToolResponse (payload: unknown): CallToolResult {
    return { content: [{ text: JSON.stringify(payload), type: 'text' as const }] }
  }

  public override hasResponseHandler (uuid: UUIDv4): boolean {
    return super.hasResponseHandler(uuid) || this.pendingMcpRequests.has(uuid)
  }

  public sendRequest (_request: ProtocolRequest): void {
    logger.warn(
      `${this.logPrefix(moduleName, 'sendRequest')} Server-initiated requests not supported in stateless MCP mode`
    )
  }

  public sendResponse (response: ProtocolResponse): void {
    const [uuid, payload] = response
    const pending = this.pendingMcpRequests.get(uuid)
    if (pending != null) {
      clearTimeout(pending.timeout)
      this.pendingMcpRequests.delete(uuid)
      pending.resolve(payload)
    } else {
      logger.error(
        `${this.logPrefix(moduleName, 'sendResponse')} Response for unknown request id: ${uuid}`
      )
    }
  }

  public start (): void {
    const version = ProtocolVersion['0.0.1']
    this.registerProtocolVersionUIService(version)

    const mcpServer = new McpServer({
      name: 'e-mobility-charging-stations-simulator',
      version,
    })

    const service = this.uiServices.get(version)

    for (const [procedureName, schema] of mcpToolSchemas) {
      mcpServer.registerTool(
        procedureName,
        {
          description: schema.description,
          inputSchema: schema.inputSchema.shape,
        },
        async (input: Record<string, unknown>) => {
          return await this.invokeProcedure(procedureName, input as RequestPayload, service)
        }
      )
    }

    registerMCPResources(mcpServer, this)
    registerMCPSchemaResources(mcpServer)
    registerMCPLogTools(mcpServer)

    this.injectOcppJsonSchemas(mcpServer)

    this.httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (!url.pathname.startsWith('/mcp')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found')
        if (!req.complete) {
          req.destroy()
        }
        return
      }

      const clientIp = req.socket.remoteAddress ?? 'unknown'
      if (!rateLimiter(clientIp)) {
        res.writeHead(429, { 'Content-Type': 'text/plain' }).end('429 Too Many Requests')
        return
      }

      let authError: Error | undefined
      this.authenticate(req, err => {
        authError = err
      })
      if (authError != null) {
        res
          .writeHead(401, {
            'Content-Type': 'text/plain',
            'WWW-Authenticate': 'Basic realm=users',
          })
          .end('401 Unauthorized')
        return
      }

      this.handleMcpRequest(mcpServer, req, res).catch((error: unknown) => {
        logger.error(
          `${this.logPrefix(moduleName, 'start.httpServer.request')} Unhandled MCP request error:`,
          error
        )
      })
    })

    this.startHttpServer()
  }

  public override stop (): void {
    for (const [uuid, pending] of this.pendingMcpRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new BaseError('Server stopping'))
      this.pendingMcpRequests.delete(uuid)
    }
    super.stop()
  }

  private checkVersionCompatibility (
    hashIds: string[] | undefined,
    ocpp16Payload: Record<string, unknown> | undefined,
    ocpp20Payload: Record<string, unknown> | undefined,
    procedureName: ProcedureName
  ): CallToolResult | undefined {
    if (ocpp16Payload == null && ocpp20Payload == null) {
      return undefined
    }
    const expectedVersion = ocpp16Payload != null ? OCPPVersion.VERSION_16 : OCPPVersion.VERSION_20
    const payloadLabel = ocpp16Payload != null ? 'ocpp16Payload' : 'ocpp20Payload'
    const alternativeLabel = ocpp16Payload != null ? 'ocpp20Payload' : 'ocpp16Payload'
    const stationsToCheck =
      hashIds != null
        ? hashIds
          .map(id => {
            const data = this.getChargingStationData(id)
            return data != null
              ? { hashId: id, version: data.stationInfo.ocppVersion }
              : undefined
          })
          .filter(s => s != null)
        : this.listChargingStationData().map(data => ({
          hashId: data.stationInfo.hashId,
          version: data.stationInfo.ocppVersion,
        }))
    const mismatched = stationsToCheck.filter(s => {
      if (expectedVersion === OCPPVersion.VERSION_16) {
        return s.version !== OCPPVersion.VERSION_16
      }
      return s.version !== OCPPVersion.VERSION_20 && s.version !== OCPPVersion.VERSION_201
    })
    if (mismatched.length > 0) {
      const ids = mismatched.map(s => s.hashId).join(', ')
      const versions = [...new Set(mismatched.map(s => s.version ?? 'unknown'))].join(', ')
      return UIMCPServer.createToolErrorResponse(
        `Station(s) ${ids} run OCPP ${versions} but received ${payloadLabel} for '${procedureName}'. ` +
          `Use ${alternativeLabel} instead, or target only compatible stations via hashIds.`
      )
    }
    return undefined
  }

  private closeTransportSafely (transport: StreamableHTTPServerTransport): void {
    transport.close().catch((error: unknown) => {
      logger.error(
        `${this.logPrefix(moduleName, 'handleMcpRequest')} MCP transport close error:`,
        error
      )
    })
  }

  private async handleMcpRequest (
    mcpServer: McpServer,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    try {
      await mcpServer.connect(transport)
    } catch (error: unknown) {
      logger.error(`${this.logPrefix(moduleName, 'handleMcpRequest')} MCP connect error:`, error)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('500 Internal Server Error')
      }
      return
    }

    try {
      if (req.method === HttpMethod.POST) {
        const body = await this.readRequestBody(req)
        res.on('close', () => {
          this.closeTransportSafely(transport)
        })
        await transport.handleRequest(req, res, body)
      } else if (req.method === HttpMethod.GET || req.method === HttpMethod.DELETE) {
        res.on('close', () => {
          this.closeTransportSafely(transport)
        })
        await transport.handleRequest(req, res)
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('405 Method Not Allowed')
        this.closeTransportSafely(transport)
      }
    } catch (error: unknown) {
      logger.error(`${this.logPrefix(moduleName, 'handleMcpRequest')} MCP transport error:`, error)
      if (!res.headersSent) {
        const isBadRequest =
          error instanceof SyntaxError ||
          (error instanceof Error && error.message.includes('Payload too large'))
        res
          .writeHead(isBadRequest ? 400 : 500, { 'Content-Type': 'text/plain' })
          .end(isBadRequest ? '400 Bad Request' : '500 Internal Server Error')
      }
    }
  }

  private injectOcppJsonSchemas (mcpServer: McpServer): void {
    const schemaCache = this.loadOcppSchemas()
    if (schemaCache.size === 0) {
      return
    }
    // Access MCP SDK internal handler map — pinned to @modelcontextprotocol/sdk@1.27.x
    // The SDK does not provide a public API for wrapping existing handlers.
    // setRequestHandler() replaces handlers entirely, losing Zod→JSON Schema conversion.
    const handlers = Reflect.get(mcpServer.server, '_requestHandlers') as
      | Map<string, (...args: unknown[]) => Promise<unknown>>
      | undefined
    if (handlers == null || !(handlers instanceof Map)) {
      logger.warn(
        `${this.logPrefix(moduleName, 'injectOcppJsonSchemas')} MCP SDK internal API changed — OCPP schema injection disabled`
      )
      return
    }
    const originalHandler = handlers.get('tools/list')
    if (originalHandler == null) {
      return
    }
    handlers.set('tools/list', async (...args: unknown[]) => {
      const result = (await originalHandler(...args)) as {
        tools: { inputSchema: { properties: Record<string, unknown> }; name: string }[]
      }
      for (const tool of result.tools) {
        const schemas = schemaCache.get(tool.name)
        if (schemas == null) {
          continue
        }
        if (schemas.ocpp16 != null && tool.inputSchema.properties.ocpp16Payload != null) {
          tool.inputSchema.properties.ocpp16Payload = {
            ...schemas.ocpp16,
            description: `OCPP 1.6 ${tool.name} request payload`,
          }
        }
        if (schemas.ocpp20 != null && tool.inputSchema.properties.ocpp20Payload != null) {
          tool.inputSchema.properties.ocpp20Payload = {
            ...schemas.ocpp20,
            description: `OCPP 2.0.1 ${tool.name} request payload`,
          }
        }
      }
      return result
    })
  }

  private async invokeProcedure (
    procedureName: ProcedureName,
    input: RequestPayload,
    service: AbstractUIService | undefined
  ): Promise<CallToolResult> {
    if (service == null) {
      return UIMCPServer.createToolErrorResponse('UI service not available')
    }

    const { ocpp16Payload, ocpp20Payload, ...rest } = input as RequestPayload & {
      ocpp16Payload?: Record<string, unknown>
      ocpp20Payload?: Record<string, unknown>
    }

    if (ocpp16Payload != null && ocpp20Payload != null) {
      return UIMCPServer.createToolErrorResponse(
        'Cannot provide both ocpp16Payload and ocpp20Payload. Use ocpp16Payload for OCPP 1.6 stations or ocpp20Payload for OCPP 2.0 stations.'
      )
    }

    const versionMismatchError = this.checkVersionCompatibility(
      rest.hashIds,
      ocpp16Payload,
      ocpp20Payload,
      procedureName
    )
    if (versionMismatchError != null) {
      return versionMismatchError
    }

    const flatPayload = {
      ...rest,
      ...(ocpp16Payload ?? ocpp20Payload),
    } as RequestPayload

    const uuid = generateUUID()

    return await new Promise<CallToolResult>(resolve => {
      const timeout = setTimeout(() => {
        this.pendingMcpRequests.delete(uuid)
        resolve(UIMCPServer.createToolErrorResponse(`Tool '${procedureName}' timed out`))
      }, MCP_TOOL_TIMEOUT_MS)

      this.pendingMcpRequests.set(uuid, {
        reject: (error: Error) => {
          resolve(UIMCPServer.createToolErrorResponse(error.message))
        },
        resolve: (payload: ResponsePayload) => {
          resolve(UIMCPServer.createToolResponse(payload))
        },
        timeout,
      })

      const request = this.buildProtocolRequest(uuid, procedureName, flatPayload)
      service
        .requestHandler(request)
        .then(directResponse => {
          if (directResponse != null) {
            const pending = this.pendingMcpRequests.get(uuid)
            if (pending != null) {
              clearTimeout(pending.timeout)
              this.pendingMcpRequests.delete(uuid)
              const [, payload] = directResponse
              resolve(UIMCPServer.createToolResponse(payload))
            }
          }
          return undefined
        })
        .catch((error: unknown) => {
          const pending = this.pendingMcpRequests.get(uuid)
          if (pending != null) {
            clearTimeout(pending.timeout)
            this.pendingMcpRequests.delete(uuid)
          }
          resolve(
            UIMCPServer.createToolErrorResponse(
              error instanceof Error ? error.message : String(error)
            )
          )
        })
    })
  }

  private loadOcppSchemas (): Map<string, { ocpp16?: unknown; ocpp20?: unknown }> {
    const cache = new Map<string, { ocpp16?: unknown; ocpp20?: unknown }>()
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const baseDir = join(currentDir, '..', '..', 'assets', 'json-schemas', 'ocpp')
    for (const [procedureName, mapping] of ocppSchemaMapping) {
      const entry: { ocpp16?: unknown; ocpp20?: unknown } = {}
      if (mapping.ocpp16 != null) {
        try {
          entry.ocpp16 = JSON.parse(
            readFileSync(join(baseDir, OCPPVersion.VERSION_16, `${mapping.ocpp16}.json`), 'utf8')
          )
        } catch {
          logger.warn(
            `${this.logPrefix(moduleName, 'loadOcppSchemas')} Failed to load OCPP 1.6 schema for ${procedureName}`
          )
        }
      }
      if (mapping.ocpp20 != null) {
        try {
          entry.ocpp20 = JSON.parse(
            readFileSync(join(baseDir, OCPPVersion.VERSION_20, `${mapping.ocpp20}.json`), 'utf8')
          )
        } catch {
          logger.warn(
            `${this.logPrefix(moduleName, 'loadOcppSchemas')} Failed to load OCPP 2.0 schema for ${procedureName}`
          )
        }
      }
      if (entry.ocpp16 != null || entry.ocpp20 != null) {
        cache.set(procedureName, entry)
      }
    }
    return cache
  }

  private readRequestBody (req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const checkBodySize = createBodySizeLimiter(DEFAULT_MAX_PAYLOAD_SIZE)
      req.on('data', (chunk: Buffer) => {
        if (!checkBodySize(chunk.length)) {
          reject(new BaseError('Payload too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new BaseError(String(error)))
        }
      })
      req.on('error', (error: Error) => {
        reject(error)
      })
    })
  }
}
