// Route names and storage prefixes specific to the v2 UI. Kept separate from
// the v1 ROUTE_NAMES so removing v1 later is a directory move + one router edit.

export const V2_ROUTE_NAMES = {
  V2_ADD_CHARGING_STATIONS: 'v2-add-charging-stations',
  V2_AUTHORIZE: 'v2-authorize',
  V2_CHARGING_STATIONS: 'v2-charging-stations',
  V2_NOT_FOUND: 'v2-not-found',
  V2_SET_SUPERVISION_URL: 'v2-set-supervision-url',
  V2_START_TRANSACTION: 'v2-start-transaction',
} as const

export const V2_LOCAL_STORAGE_PREFIX = 'v2-'
export const V2_UI_SERVER_INDEX_KEY = `${V2_LOCAL_STORAGE_PREFIX}uiServerConfigurationIndex`
export const V2_THEME_KEY = `${V2_LOCAL_STORAGE_PREFIX}theme`

export type V2ThemeEffective = 'dark' | 'light'
export type V2ThemeMode = 'auto' | 'dark' | 'light'
