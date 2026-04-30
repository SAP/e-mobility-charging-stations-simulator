import { type SKIN_IDS } from 'ui-common'

// Local UI project constants

export const ASYNC_COMPONENT_DELAY_MS = 200
export const DEFAULT_SKIN: (typeof SKIN_IDS)[number] = 'modern'
export const ASYNC_COMPONENT_TIMEOUT_MS = 10_000
export const EMPTY_VALUE_PLACEHOLDER = 'Ø'
export const MAX_SKIN_ERROR_RELOADS = 2
export const MAX_STATIONS_PER_ADD = 100
export const WH_PER_KWH = 1000

export const ROUTE_NAMES = {
  ADD_CHARGING_STATIONS: 'add-charging-stations',
  CHARGING_STATIONS: 'charging-stations',
  NOT_FOUND: 'not-found',
  SET_SUPERVISION_URL: 'set-supervision-url',
  START_TRANSACTION: 'start-transaction',
} as const

export const SHARED_TOGGLE_BUTTON_KEY_PREFIX = 'shared-toggle-button-'
// Per-station keys (dynamic) — no `ecs-ui-` namespace unlike global skin/theme keys.
export const TOGGLE_BUTTON_KEY_PREFIX = 'toggle-button-'
export const UI_SERVER_CONFIGURATION_INDEX_KEY = 'ecs-ui-server-index'
// Legacy key — used only for one-time migration read at boot.
export const LEGACY_UI_SERVER_CONFIG_KEY = 'uiServerConfigurationIndex'
