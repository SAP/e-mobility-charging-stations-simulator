import type { UIServerConfigurationSection } from 'ui-common'

// Canonical defaults for CLI configuration.
// All configurable parameters must have safe default values defined here.
export const DEFAULT_HOST = 'localhost'
export const DEFAULT_PORT = 8080
export const DEFAULT_PROTOCOL = 'ui'
export const DEFAULT_VERSION = '0.0.1'
export const DEFAULT_SECURE = false
export const DEFAULT_TIMEOUT_MS = 60_000

export const defaultUIServerConfig: UIServerConfigurationSection = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  protocol: DEFAULT_PROTOCOL,
  secure: DEFAULT_SECURE,
  version: DEFAULT_VERSION,
}
