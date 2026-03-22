import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { open, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { AbstractUIServer } from '../AbstractUIServer.js'

import { ConfigurationSection, type LogConfiguration } from '../../../types/index.js'
import { Configuration } from '../../../utils/Configuration.js'

const getLogFilePath = (configField: 'errorFile' | 'file'): string | undefined => {
  const logConfig = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log
  )
  const relativePath = logConfig[configField]
  if (relativePath == null) {
    return undefined
  }
  const date = new Date().toISOString().slice(0, 10)
  const dir = dirname(resolve(relativePath))
  const baseName = configField === 'file' ? `combined-${date}.log` : `error-${date}.log`
  return join(dir, baseName)
}

const TAIL_BYTES = 65_536

const tailFile = async (filePath: string, maxLines: number): Promise<string> => {
  const fileStat = await stat(filePath)
  const fileHandle = await open(filePath, 'r')
  try {
    const readSize = Math.min(TAIL_BYTES, fileStat.size)
    const position = Math.max(0, fileStat.size - readSize)
    const buffer = Buffer.alloc(readSize)
    await fileHandle.read(buffer, 0, readSize, position)
    const lines = buffer.toString('utf8').split('\n')
    if (position > 0) {
      lines.shift()
    }
    return lines.slice(-maxLines).join('\n')
  } finally {
    await fileHandle.close()
  }
}

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
        const logPath = getLogFilePath('file')
        if (logPath == null) {
          return {
            contents: [
              { mimeType: 'text/plain', text: 'Log file not configured', uri: 'log://combined' },
            ],
          }
        }
        const recent = await tailFile(logPath, 200)
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
        const logPath = getLogFilePath('errorFile')
        if (logPath == null) {
          return {
            contents: [
              { mimeType: 'text/plain', text: 'Error log file not configured', uri: 'log://error' },
            ],
          }
        }
        const recent = await tailFile(logPath, 100)
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
