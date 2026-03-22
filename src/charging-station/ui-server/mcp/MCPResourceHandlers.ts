import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import type { AbstractUIServer } from '../AbstractUIServer.js'

import { ConfigurationSection, type LogConfiguration } from '../../../types/index.js'
import { Configuration } from '../../../utils/Configuration.js'

const MAX_TAIL_LINES = 5000
const DEFAULT_TAIL_LINES = 200
const TAIL_BYTES = 65_536

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

const tailFile = async (
  filePath: string,
  maxLines: number
): Promise<{ lines: string[]; totalLines: number }> => {
  const fileStat = await stat(filePath)
  const fileHandle = await open(filePath, 'r')
  try {
    const fullContent = fileStat.size <= TAIL_BYTES
    const readSize = Math.min(TAIL_BYTES, fileStat.size)
    const position = Math.max(0, fileStat.size - readSize)
    const buffer = Buffer.alloc(readSize)
    await fileHandle.read(buffer, 0, readSize, position)
    const allLines = buffer.toString('utf8').split('\n')
    if (position > 0) {
      allLines.shift()
    }
    const totalLines = fullContent ? allLines.length : -1
    return { lines: allLines.slice(-maxLines), totalLines }
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
}

const OCPP_SCHEMA_VERSIONS = ['1.6', '2.0'] as const

const getSchemaBaseDir = (): string => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const prodPath = join(currentDir, 'assets', 'json-schemas', 'ocpp')
  const devPath = join(currentDir, '..', '..', '..', 'assets', 'json-schemas', 'ocpp')
  return resolve(prodPath).includes('assets') ? prodPath : devPath
}

export const registerMCPSchemaResources = (server: McpServer): void => {
  for (const version of OCPP_SCHEMA_VERSIONS) {
    server.registerResource(
      `ocpp-${version}-schema-list`,
      `schema://ocpp/${version}`,
      {
        description: `List all available OCPP ${version} JSON command schemas`,
        mimeType: 'application/json',
      },
      async _uri => {
        try {
          const schemaDir = join(getSchemaBaseDir(), version)
          const files = await readdir(schemaDir)
          const commands = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''))
            .sort()
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify({ commands, count: commands.length, version }, null, 2),
                uri: `schema://ocpp/${version}`,
              },
            ],
          }
        } catch {
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify({ error: `OCPP ${version} schemas not available` }),
                uri: `schema://ocpp/${version}`,
              },
            ],
          }
        }
      }
    )
  }

  server.registerResource(
    'ocpp-schema-by-command',
    new ResourceTemplate('schema://ocpp/{version}/{command}', { list: undefined }),
    {
      description:
        'Full OCPP JSON schema for a specific command (e.g., schema://ocpp/1.6/Authorize or schema://ocpp/2.0/AuthorizeRequest)',
      mimeType: 'application/json',
    },
    async (uri, { command, version }) => {
      try {
        const schemaDir = join(getSchemaBaseDir(), String(version))
        const schemaPath = join(schemaDir, `${String(command)}.json`)
        const content = await readFile(schemaPath, 'utf8')
        return {
          contents: [
            {
              mimeType: 'application/json',
              text: content,
              uri: uri.href,
            },
          ],
        }
      } catch {
        return {
          contents: [
            {
              mimeType: 'application/json',
              text: JSON.stringify({
                error: `Schema '${String(command)}' not found for OCPP ${String(version)}`,
              }),
              uri: uri.href,
            },
          ],
        }
      }
    }
  )
}

export const registerMCPLogTools = (server: McpServer): void => {
  server.registerTool(
    'readCombinedLog',
    {
      annotations: { readOnlyHint: true },
      description:
        'Read recent entries from the combined simulator log file. Returns the last N lines (default 200, max 5000).',
      inputSchema: {
        tail: z
          .number()
          .int()
          .positive()
          .max(MAX_TAIL_LINES)
          .default(DEFAULT_TAIL_LINES)
          .describe('Number of lines to return from the end of the log'),
      },
    },
    async ({ tail }) => {
      try {
        const logPath = getLogFilePath('file')
        if (logPath == null) {
          return {
            content: [{ text: 'Log file not configured', type: 'text' as const }],
            isError: true,
          }
        }
        const { lines, totalLines } = await tailFile(logPath, tail)
        const meta =
          totalLines >= 0
            ? `Showing last ${String(lines.length)} of ${String(totalLines)} lines`
            : `Showing last ${String(lines.length)} lines`
        return {
          content: [{ text: `${meta}\n\n${lines.join('\n')}`, type: 'text' as const }],
        }
      } catch {
        return {
          content: [{ text: 'Log file not available', type: 'text' as const }],
          isError: true,
        }
      }
    }
  )

  server.registerTool(
    'readErrorLog',
    {
      annotations: { readOnlyHint: true },
      description:
        'Read recent entries from the error log file. Returns the last N lines (default 200, max 5000).',
      inputSchema: {
        tail: z
          .number()
          .int()
          .positive()
          .max(MAX_TAIL_LINES)
          .default(DEFAULT_TAIL_LINES)
          .describe('Number of lines to return from the end of the log'),
      },
    },
    async ({ tail }) => {
      try {
        const logPath = getLogFilePath('errorFile')
        if (logPath == null) {
          return {
            content: [{ text: 'Error log file not configured', type: 'text' as const }],
            isError: true,
          }
        }
        const { lines, totalLines } = await tailFile(logPath, tail)
        const meta =
          totalLines >= 0
            ? `Showing last ${String(lines.length)} of ${String(totalLines)} lines`
            : `Showing last ${String(lines.length)} lines`
        return {
          content: [{ text: `${meta}\n\n${lines.join('\n')}`, type: 'text' as const }],
        }
      } catch {
        return {
          content: [{ text: 'Error log file not available', type: 'text' as const }],
          isError: true,
        }
      }
    }
  )
}
