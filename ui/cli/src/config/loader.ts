import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  uiServerConfigSchema,
  type UIServerConfigurationSection,
} from 'ui-common'

import { extractErrorMessage } from '../utils/errors.js'
import { DEFAULT_PROTOCOL, DEFAULT_SECURE, DEFAULT_VERSION } from './defaults.js'

interface LoadConfigOptions {
  configPath?: string
  url?: string
}

interface ParsedUrl {
  host: string
  port: number
  secure: boolean
}

const getXdgConfigPath = (): string => {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(xdgConfigHome, 'evse-cli', 'config.json')
}

const parseServerUrl = (url: string): ParsedUrl => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`Invalid URL scheme '${parsed.protocol}' — expected ws: or wss:`)
  }
  const secure = parsed.protocol === 'wss:'
  const port = parsed.port !== '' ? Number.parseInt(parsed.port, 10) : secure ? 443 : 80
  return {
    host: parsed.hostname,
    port,
    secure,
  }
}

const readJsonFile = async (filePath: string): Promise<unknown> => {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as unknown
}

const loadConfigFile = async (
  configPath?: string
): Promise<Partial<UIServerConfigurationSection>> => {
  const targetPath = configPath ?? getXdgConfigPath()
  try {
    const raw = await readJsonFile(targetPath)
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      const parsed = raw as Record<string, unknown>
      const uiServer = parsed.uiServer ?? parsed
      if (Array.isArray(uiServer)) {
        throw new Error('Config contains multiple uiServer entries; the CLI supports only one')
      }
      if (typeof uiServer !== 'object') {
        throw new Error('Config uiServer must be an object')
      }
      return uiServer as Partial<UIServerConfigurationSection>
    }
    throw new Error(`Config file '${targetPath}' must contain a JSON object`)
  } catch (error: unknown) {
    if (
      configPath != null ||
      !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      const message = extractErrorMessage(error)
      const context = configPath != null ? `'${configPath}'` : `'${targetPath}'`
      throw new Error(`Failed to load configuration file ${context}: ${message}`, { cause: error })
    }
    return {}
  }
}

export const loadConfig = async (
  options: LoadConfigOptions = {}
): Promise<UIServerConfigurationSection> => {
  const defaults: UIServerConfigurationSection = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    protocol: DEFAULT_PROTOCOL,
    secure: DEFAULT_SECURE,
    version: DEFAULT_VERSION,
  }

  const fileConfig = await loadConfigFile(options.configPath)

  const cliOverrides: Partial<UIServerConfigurationSection> = {}
  if (options.url != null) {
    const parsed = parseServerUrl(options.url)
    cliOverrides.host = parsed.host
    cliOverrides.port = parsed.port
    cliOverrides.secure = parsed.secure
  }

  const merged = {
    ...defaults,
    ...fileConfig,
    ...cliOverrides,
  }

  return uiServerConfigSchema.parse(merged)
}
