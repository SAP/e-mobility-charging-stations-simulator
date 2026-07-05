import chalk from 'chalk'
import Table from 'cli-table3'
import {
  type ConnectorEntry,
  type EvseEntry,
  OCPP16ChargePointStatus,
  WebSocketReadyState,
} from 'ui-common'

const NO_BORDER = {
  bottom: '',
  'bottom-left': '',
  'bottom-mid': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  middle: ' ',
  right: '',
  'right-mid': '',
  top: '',
  'top-left': '',
  'top-mid': '',
  'top-right': '',
}

export const MISSING_VALUE_PLACEHOLDER = '–'
export const TEMPLATE_NAME_SUFFIX = '.station-template'
export const TRUNCATED_HASH_ID_LENGTH = 12

// cspell:ignore borderless
export const borderlessTable = (head: string[], colWidths?: number[]): Table.Table =>
  new Table({
    chars: NO_BORDER,
    head: head.map(h => chalk.bold(h.toUpperCase())),
    style: { 'padding-left': 0, 'padding-right': 2 },
    ...(colWidths != null && { colWidths }),
  })

export const stripTemplateSuffix = (name: string): string =>
  name.endsWith(TEMPLATE_NAME_SUFFIX) ? name.slice(0, -TEMPLATE_NAME_SUFFIX.length) : name

export const truncateId = (id: string, len = TRUNCATED_HASH_ID_LENGTH): string =>
  id.length > len ? `${id.slice(0, len)}…` : id

export const statusIcon = (started: boolean | undefined): string =>
  started === true ? chalk.green('●') : chalk.dim('○')

export const wsIcon = (wsState: number | undefined): string => {
  switch (wsState) {
    case WebSocketReadyState.CLOSED:
    case WebSocketReadyState.CLOSING:
      return chalk.red('✗')
    case WebSocketReadyState.CONNECTING:
      return chalk.yellow('…')
    case WebSocketReadyState.OPEN:
      return chalk.green('✓')
    default:
      return chalk.dim(MISSING_VALUE_PLACEHOLDER)
  }
}

const STATUS_ABBREVIATIONS: Record<string, string> = {
  [OCPP16ChargePointStatus.FINISHING]: 'Fi',
  [OCPP16ChargePointStatus.SUSPENDED_EV]: 'SE',
  [OCPP16ChargePointStatus.SUSPENDED_EVSE]: 'SS',
}

const statusLetter = (status: string | undefined): string => {
  if (status == null || status.length === 0) return '?'
  return STATUS_ABBREVIATIONS[status] ?? status.charAt(0).toUpperCase()
}

export const formatConnectors = (evses: EvseEntry[], connectors: ConnectorEntry[]): string => {
  const entries: string[] = []

  if (evses.length > 0) {
    for (const evse of evses) {
      if (evse.evseId > 0) {
        for (const c of evse.evseStatus.connectors) {
          if (c.connectorId > 0) {
            entries.push(`${c.connectorId.toString()}:${statusLetter(c.connectorStatus.status)}`)
          }
        }
      }
    }
  } else {
    for (const c of connectors) {
      if (c.connectorId > 0) {
        entries.push(`${c.connectorId.toString()}:${statusLetter(c.connectorStatus.status)}`)
      }
    }
  }

  return entries.length > 0 ? chalk.dim(entries.join(' ')) : chalk.dim(MISSING_VALUE_PLACEHOLDER)
}

export const fuzzyTime = (ts: number | undefined): string => {
  if (ts == null) return chalk.dim(MISSING_VALUE_PLACEHOLDER)
  const diff = Math.max(0, Date.now() - ts)
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return chalk.dim('just now')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return chalk.dim(`${minutes.toString()}m ago`)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return chalk.dim(`${hours.toString()}h ago`)
  const days = Math.floor(hours / 24)
  return chalk.dim(`${days.toString()}d ago`)
}
