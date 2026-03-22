/**
 * @file UIMCPServer Integration Tests
 * @description HTTP integration tests verifying MCP endpoint responds correctly
 */

import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { UIMCPServer } from '../../../src/charging-station/ui-server/UIMCPServer.js'
import { HttpMethod } from '../../../src/charging-station/ui-server/UIServerUtils.js'
import { ApplicationProtocol } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockUIServerConfiguration } from './UIServerTestUtils.js'

const TEST_PORT = 18999

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

await describe('UIMCPServer HTTP Integration', async () => {
  let server: UIMCPServer

  beforeEach(() => {
    server = new UIMCPServer(
      createMockUIServerConfiguration({
        options: { host: 'localhost', port: TEST_PORT },
        type: ApplicationProtocol.MCP,
      })
    )
    server.start()
  })

  afterEach(async () => {
    server.stop()
    await new Promise(resolve => {
      setTimeout(resolve, 50)
    })
    standardCleanup()
  })

  await it('should respond to MCP initialize request with serverInfo and capabilities', async () => {
    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })

    const response = await makeMcpPost(TEST_PORT, {
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
})
