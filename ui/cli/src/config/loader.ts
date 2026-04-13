import type { UIServerConfig } from 'ui-common'

import { lilconfig } from 'lilconfig'
import { uiServerConfigSchema } from 'ui-common'

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_PROTOCOL,
  DEFAULT_SECURE,
  DEFAULT_VERSION,
} from './defaults.js'

interface LoadConfigOptions {
  configPath?: string
  url?: string
}

interface ParsedUrl {
  host: string
  port: number
  secure: boolean
}

const parseServerUrl = (url: string): ParsedUrl => {
  const parsed = new URL(url)
  const secure = parsed.protocol === 'wss:'
  const port = parsed.port !== '' ? parseInt(parsed.port, 10) : secure ? 443 : 80
  return {
    host: parsed.hostname,
    port,
    secure,
  }
}

const loadConfigFile = async (configPath?: string): Promise<Partial<UIServerConfig>> => {
  if (configPath != null) {
    const result = await lilconfig('evse-cli').load(configPath)
    if (result?.config != null) {
      const parsed = result.config as Record<string, unknown>
      return (parsed.uiServer ?? parsed) as Partial<UIServerConfig>
    }
    return {}
  }
  const result = await lilconfig('evse-cli').search()
  if (result?.config != null) {
    const parsed = result.config as Record<string, unknown>
    return (parsed.uiServer ?? parsed) as Partial<UIServerConfig>
  }
  return {}
}

export const loadConfig = async (options: LoadConfigOptions = {}): Promise<UIServerConfig> => {
  const defaults: UIServerConfig = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    protocol: DEFAULT_PROTOCOL,
    secure: DEFAULT_SECURE,
    version: DEFAULT_VERSION,
  }

  const fileConfig = await loadConfigFile(options.configPath)

  const cliOverrides: Partial<UIServerConfig> = {}
  if (options.url != null) {
    const parsed = parseServerUrl(options.url)
    cliOverrides.host = parsed.host
    cliOverrides.port = parsed.port
    cliOverrides.secure = parsed.secure
  }

  // Merge precedence: defaults < file config < CLI overrides
  const merged = {
    ...defaults,
    ...fileConfig,
    ...cliOverrides,
  }

  return uiServerConfigSchema.parse(merged)
}
