import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import type { AbstractUIServer } from '../AbstractUIServer.js'

import { ConfigurationSection, type LogConfiguration, OCPPVersion } from '../../../types/index.js'
import { Configuration } from '../../../utils/Configuration.js'

const MAX_TAIL_LINES = 5000
const DEFAULT_TAIL_LINES = 200
const TAIL_BYTES = 65_536

const getLogFilePath = (configField: 'errorFile' | 'file', date?: string): string | undefined => {
  const logConfig = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log
  )
  const relativePath = logConfig[configField]
  if (relativePath == null) {
    return undefined
  }
  if (logConfig.rotate !== true) {
    return resolve(relativePath)
  }
  const now = new Date()
  const localDate =
    date ??
    `${now.getFullYear().toString()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
  const dir = dirname(resolve(relativePath))
  const baseName = configField === 'file' ? `combined-${localDate}.log` : `error-${localDate}.log`
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
                : JSON.stringify({ error: `Station '${hashId as string}' not found` }),
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

const OCPP_SCHEMA_VERSIONS = [OCPPVersion.VERSION_16, OCPPVersion.VERSION_20] as const

const getSchemaBaseDir = (): string => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return join(currentDir, 'assets', 'json-schemas', 'ocpp')
}

// Path traversal guard: validate that the resolved path stays within the expected base directory.
const isPathWithinBase = (candidatePath: string, baseDir: string): boolean => {
  const resolvedBase = resolve(baseDir)
  const resolvedCandidate = resolve(candidatePath)
  return resolvedCandidate.startsWith(`${resolvedBase}/`) || resolvedCandidate === resolvedBase
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
          const baseDir = getSchemaBaseDir()
          const schemaDir = join(baseDir, version)
          if (!isPathWithinBase(schemaDir, baseDir)) {
            return {
              contents: [
                {
                  mimeType: 'application/json',
                  text: JSON.stringify({ error: `Invalid OCPP version '${version}'` }),
                  uri: `schema://ocpp/${version}`,
                },
              ],
            }
          }
          const files = await readdir(schemaDir)
          const commands = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''))
            .sort((a, b) => a.localeCompare(b))
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
        const versionStr = version as string
        const commandStr = command as string
        const baseDir = getSchemaBaseDir()
        const schemaPath = join(baseDir, versionStr, `${commandStr}.json`)
        if (!isPathWithinBase(schemaPath, baseDir)) {
          return {
            contents: [
              {
                mimeType: 'application/json',
                text: JSON.stringify({
                  error: `Invalid schema path for '${commandStr}' in OCPP ${versionStr}`,
                }),
                uri: uri.href,
              },
            ],
          }
        }
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
                error: `Schema '${command as string}' not found for OCPP ${version as string}`,
              }),
              uri: uri.href,
            },
          ],
        }
      }
    }
  )
}

const registerLogReadTool = (
  server: McpServer,
  name: string,
  configField: 'errorFile' | 'file',
  description: string
): void => {
  const label = configField === 'file' ? 'Log' : 'Error log'
  server.registerTool(
    name,
    {
      annotations: { readOnlyHint: true },
      description,
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Log file date in YYYY-MM-DD format. Defaults to current local date'),
        tail: z
          .number()
          .int()
          .positive()
          .max(MAX_TAIL_LINES)
          .default(DEFAULT_TAIL_LINES)
          .describe('Number of lines to return from the end of the log'),
      },
    },
    async ({ date, tail }) => {
      try {
        const logPath = getLogFilePath(configField, date)
        if (logPath == null) {
          return {
            content: [{ text: `${label} file not configured`, type: 'text' as const }],
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
          content: [{ text: `${label} file not available`, type: 'text' as const }],
          isError: true,
        }
      }
    }
  )
}

export const registerMCPLogTools = (server: McpServer): void => {
  registerLogReadTool(
    server,
    'readCombinedLog',
    'file',
    'Read recent entries from the combined simulator log file. Returns the last N lines (default 200, max 5000). Optionally specify a date (YYYY-MM-DD) for rotated log files.'
  )
  registerLogReadTool(
    server,
    'readErrorLog',
    'errorFile',
    'Read recent entries from the error log file. Returns the last N lines (default 200, max 5000). Optionally specify a date (YYYY-MM-DD) for rotated log files.'
  )
}
