// Local UI project constants

export const EMPTY_VALUE_PLACEHOLDER = 'Ø'

export const ROUTE_NAMES = {
  ADD_CHARGING_STATIONS: 'add-charging-stations',
  CHARGING_STATIONS: 'charging-stations',
  NOT_FOUND: 'not-found',
  SET_SUPERVISION_URL: 'set-supervision-url',
  START_TRANSACTION: 'start-transaction',
} as const

export const SHARED_TOGGLE_BUTTON_KEY_PREFIX = 'shared-toggle-button-'
// Toggle button keys use a descriptive prefix without the `ecs-ui-` namespace
// because they are per-station (dynamic), unlike the global skin/theme keys.
export const TOGGLE_BUTTON_KEY_PREFIX = 'toggle-button-'
export const UI_SERVER_CONFIGURATION_INDEX_KEY = 'uiServerConfigurationIndex'
