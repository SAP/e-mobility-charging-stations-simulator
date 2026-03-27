import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { open, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

import { ConfigurationSection, type LogConfiguration } from '../../../types/index.js'
import { Configuration } from '../../../utils/Configuration.js'

const MAX_TAIL_LINES = 5000
const DEFAULT_TAIL_LINES = 200
const TAIL_BYTES = 65_536

const getLogFilePath = (configField: 'errorFile' | 'file', date?: string): string | undefined => {
  const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log
  )
  const relativePath = logConfiguration[configField]
  if (relativePath == null) {
    return undefined
  }
  if (logConfiguration.rotate !== true) {
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
