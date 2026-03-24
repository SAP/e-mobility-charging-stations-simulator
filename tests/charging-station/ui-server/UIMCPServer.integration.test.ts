/**
 * @file UIMCPServer Integration Tests
 * @description HTTP integration tests verifying MCP endpoint responds correctly
 */

import type { AddressInfo } from 'node:net'

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { request as httpRequest, type Server } from 'node:http'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { UIMCPServer } from '../../../src/charging-station/ui-server/UIMCPServer.js'
import { HttpMethod } from '../../../src/charging-station/ui-server/UIServerUtils.js'
import { ApplicationProtocol } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockUIServerConfiguration } from './UIServerTestUtils.js'

/**
 * Parse SSE events from raw response body.
 * MCP Streamable HTTP transport sends responses as SSE `event: message` frames.
 * @param raw - Raw SSE response body string
 * @returns Array of parsed JSON objects from SSE data lines
 */
const parseSseEvents = (raw: string): object[] => {
  const events: object[] = []
  for (const block of raw.split('\n\n')) {
    const dataLine = block.split('\n').find(line => line.startsWith('data: '))
    if (dataLine != null) {
      const jsonStr = dataLine.slice('data: '.length).trim()
      if (jsonStr.length > 0) {
        events.push(JSON.parse(jsonStr) as object)
      }
    }
  }
  return events
}

const makeMcpPost = (port: number, body: object): Promise<{ events: object[]; status: number }> => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = httpRequest(
      {
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(payload),
          'Content-Type': 'application/json',
        },
        hostname: 'localhost',
        method: HttpMethod.POST,
        path: '/mcp',
        port,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          const contentType = res.headers['content-type'] ?? ''
          if (contentType.includes('text/event-stream')) {
            resolve({ events: parseSseEvents(raw), status: res.statusCode ?? 0 })
          } else {
            try {
              resolve({ events: [JSON.parse(raw) as object], status: res.statusCode ?? 0 })
            } catch {
              reject(new Error(`Invalid response: ${raw}`))
            }
          }
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

const callTool = async (
  port: number,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<{ content: { text: string; type: string }[]; isError?: boolean }> => {
  // Initialize session
  await makeMcpPost(port, {
    id: 'init',
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0' },
      protocolVersion: '2025-03-26',
    },
  })
  // Call tool
  const response = await makeMcpPost(port, {
    id: 'call',
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { arguments: args, name: toolName },
  })
  assert.strictEqual(response.status, 200)
  assert.ok(response.events.length > 0)
  const body = response.events[response.events.length - 1] as Record<string, unknown>
  assert.strictEqual(body.jsonrpc, '2.0')
  assert.strictEqual(body.id, 'call')
  return body.result as { content: { text: string; type: string }[]; isError?: boolean }
}

await describe('UIMCPServer HTTP Integration', async () => {
  let server: UIMCPServer
  let testPort: number

  beforeEach(async () => {
    server = new UIMCPServer(
      createMockUIServerConfiguration({
        options: { host: 'localhost', port: 0 },
        type: ApplicationProtocol.MCP,
      })
    )
    server.start()
    const httpServer = Reflect.get(server, 'httpServer') as Server
    await new Promise<void>(resolve => {
      if (httpServer.listening) {
        resolve()
      } else {
        httpServer.on('listening', resolve)
      }
    })
    testPort = (httpServer.address() as AddressInfo).port
  })

  afterEach(async () => {
    const httpServer = Reflect.get(server, 'httpServer') as Server
    if (httpServer.listening) {
      await new Promise<void>(resolve => {
        httpServer.close(() => {
          resolve()
        })
      })
    }
    server.stop()
    standardCleanup()
  })

  await it('should respond to MCP initialize request with serverInfo and capabilities', async () => {
    const response = await makeMcpPost(testPort, {
      id: '1',
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
        protocolVersion: '2025-03-26',
      },
    })

    assert.strictEqual(response.status, 200)
    assert.ok(response.events.length > 0, 'Should receive at least one SSE event')
    const body = response.events[response.events.length - 1] as Record<string, unknown>
    assert.strictEqual(body.jsonrpc, '2.0')
    assert.strictEqual(body.id, '1')
    assert.ok('result' in body, 'Response should have a result field')
    const result = body.result as Record<string, unknown>
    assert.ok('serverInfo' in result, 'Result should have serverInfo')
    assert.ok('capabilities' in result, 'Result should have capabilities')
  })

  await describe('readCombinedLog tool', async () => {
    await it('should return log content with default date (current local date)', async () => {
      // Arrange - create a log file for today's local date
      const now = new Date()
      const todayDate = `${now.getFullYear().toString()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
      const logDir = join(process.cwd(), 'logs')
      const logFile = join(logDir, `combined-${todayDate}.log`)
      writeFileSync(logFile, 'info: test log line 1\ninfo: test log line 2\n', { flag: 'a' })

      // Act
      const result = await callTool(testPort, 'readCombinedLog', { tail: 10 })

      // Assert
      assert.strictEqual(result.isError, undefined)
      assert.ok(result.content.length > 0)
      assert.strictEqual(result.content[0].type, 'text')
      assert.ok(result.content[0].text.includes('Showing last'))
    })

    await it('should return log content for explicit date parameter', async () => {
      // Arrange - create a log file for a specific date
      const logDir = join(process.cwd(), 'logs')
      const testDate = '2020-01-01'
      const logFile = join(logDir, `combined-${testDate}.log`)
      writeFileSync(logFile, 'info: historical log entry\n')

      // Act
      const result = await callTool(testPort, 'readCombinedLog', { date: testDate, tail: 10 })

      // Assert
      assert.strictEqual(result.isError, undefined)
      assert.ok(result.content.length > 0)
      assert.strictEqual(result.content[0].type, 'text')
      assert.ok(result.content[0].text.includes('historical log entry'))
    })

    await it('should return error for non-existent date log file', async () => {
      const result = await callTool(testPort, 'readCombinedLog', { date: '1999-01-01', tail: 10 })

      assert.strictEqual(result.isError, true)
      assert.ok(result.content[0].text.includes('not available'))
    })
  })
})
