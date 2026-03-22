import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import type { AbstractUIService } from './ui-services/AbstractUIService.js'

import {
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
import { mcpToolSchemas, registerMCPResources } from './mcp/index.js'
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
      logger.warn(
        `${this.logPrefix(moduleName, 'sendResponse')} Response for unknown request id: ${uuid}`
      )
    }
  }

  public start (): void {
    const version = ProtocolVersion['0.0.1']
    this.registerProtocolVersionUIService(version)

    const mcpServer = new McpServer({
      name: 'e-mobility-charging-stations-simulator',
      version: '1.0.0',
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
      pending.reject(new Error('Server stopping'))
      this.pendingMcpRequests.delete(uuid)
    }
    super.stop()
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
          transport.close().catch((error: unknown) => {
            logger.error(
              `${this.logPrefix(moduleName, 'handleMcpRequest')} MCP transport close error:`,
              error
            )
          })
        })
        await transport.handleRequest(req, res, body)
      } else if (req.method === HttpMethod.GET || req.method === HttpMethod.DELETE) {
        res.on('close', () => {
          transport.close().catch((error: unknown) => {
            logger.error(
              `${this.logPrefix(moduleName, 'handleMcpRequest')} MCP transport close error:`,
              error
            )
          })
        })
        await transport.handleRequest(req, res)
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('405 Method Not Allowed')
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

  private async invokeProcedure (
    procedureName: ProcedureName,
    input: RequestPayload,
    service: AbstractUIService | undefined
  ): Promise<CallToolResult> {
    if (service == null) {
      return {
        content: [
          {
            text: JSON.stringify({ error: 'UI service not available', status: 'failure' }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    const uuid = generateUUID()

    return await new Promise<CallToolResult>(resolve => {
      const timeout = setTimeout(() => {
        this.pendingMcpRequests.delete(uuid)
        resolve({
          content: [
            {
              text: JSON.stringify({
                error: `Tool '${procedureName}' timed out`,
                status: 'failure',
              }),
              type: 'text',
            },
          ],
          isError: true,
        })
      }, MCP_TOOL_TIMEOUT_MS)

      this.pendingMcpRequests.set(uuid, {
        reject: (error: Error) => {
          resolve({
            content: [
              {
                text: JSON.stringify({ error: error.message, status: 'failure' }),
                type: 'text',
              },
            ],
            isError: true,
          })
        },
        resolve: (payload: ResponsePayload) => {
          resolve({ content: [{ text: JSON.stringify(payload), type: 'text' }] })
        },
        timeout,
      })

      const request = this.buildProtocolRequest(uuid, procedureName, input)
      service
        .requestHandler(request)
        .then(directResponse => {
          if (directResponse != null) {
            const pending = this.pendingMcpRequests.get(uuid)
            if (pending != null) {
              clearTimeout(pending.timeout)
              this.pendingMcpRequests.delete(uuid)
              const [, payload] = directResponse
              resolve({ content: [{ text: JSON.stringify(payload), type: 'text' }] })
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
          resolve({
            content: [
              {
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                  status: 'failure',
                }),
                type: 'text',
              },
            ],
            isError: true,
          })
        })
    })
  }

  private readRequestBody (req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const checkBodySize = createBodySizeLimiter(DEFAULT_MAX_PAYLOAD_SIZE)
      let totalSize = 0
      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length
        if (!checkBodySize(totalSize)) {
          reject(new Error('Payload too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
      req.on('error', (error: Error) => {
        reject(error)
      })
    })
  }
}
