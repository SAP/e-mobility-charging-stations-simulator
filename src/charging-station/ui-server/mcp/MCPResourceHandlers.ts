import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AbstractUIServer } from '../AbstractUIServer.js'

export const registerMCPResources = (server: McpServer, uiServer: AbstractUIServer): void => {
  server.registerResource(
    'station-list',
    'station://list',
    {
      description: 'List all charging stations with their current status and info',
      mimeType: 'application/json',
    },
    _uri => ({
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(uiServer.listChargingStationData(), null, 2),
          uri: 'station://list',
        },
      ],
    })
  )

  server.registerResource(
    'station-by-id',
    new ResourceTemplate('station://{hashId}', { list: undefined }),
    {
      description: 'Get data for a specific charging station by its hash ID',
      mimeType: 'application/json',
    },
    (uri, { hashId }) => {
      const data = uiServer.getChargingStationData(hashId as string)
      return {
        contents: [
          {
            mimeType: 'application/json',
            text:
              data != null
                ? JSON.stringify(data, null, 2)
                : JSON.stringify({ error: `Station '${String(hashId)}' not found` }),
            uri: uri.href,
          },
        ],
      }
    }
  )

  server.registerResource(
    'template-list',
    'template://list',
    {
      description: 'List all available charging station configuration templates',
      mimeType: 'application/json',
    },
    _uri => ({
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(uiServer.getChargingStationTemplates(), null, 2),
          uri: 'template://list',
        },
      ],
    })
  )

  server.registerResource(
    'log-combined',
    'log://combined',
    { description: 'Recent combined simulator log entries', mimeType: 'text/plain' },
    async _uri => {
      try {
        const date = new Date().toISOString().slice(0, 10)
        const logPath = join(process.cwd(), 'logs', `combined-${date}.log`)
        const content = await readFile(logPath, 'utf8')
        const lines = content.split('\n')
        const recent = lines.slice(-200).join('\n')
        return { contents: [{ mimeType: 'text/plain', text: recent, uri: 'log://combined' }] }
      } catch {
        return {
          contents: [
            { mimeType: 'text/plain', text: 'Log file not available', uri: 'log://combined' },
          ],
        }
      }
    }
  )

  server.registerResource(
    'log-error',
    'log://error',
    { description: 'Recent error log entries', mimeType: 'text/plain' },
    async _uri => {
      try {
        const date = new Date().toISOString().slice(0, 10)
        const logPath = join(process.cwd(), 'logs', `error-${date}.log`)
        const content = await readFile(logPath, 'utf8')
        const lines = content.split('\n')
        const recent = lines.slice(-100).join('\n')
        return { contents: [{ mimeType: 'text/plain', text: recent, uri: 'log://error' }] }
      } catch {
        return {
          contents: [
            { mimeType: 'text/plain', text: 'Log file not available', uri: 'log://error' },
          ],
        }
      }
    }
  )
}
