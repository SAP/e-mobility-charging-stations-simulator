import chalk from 'chalk'
import Table from 'cli-table3'
import { type ConnectorEntry, type EvseEntry, OCPP16ChargePointStatus } from 'ui-common'

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

// cspell:ignore borderless
export const borderlessTable = (head: string[], colWidths?: number[]): Table.Table =>
  new Table({
    chars: NO_BORDER,
    head: head.map(h => chalk.bold(h.toUpperCase())),
    style: { 'padding-left': 0, 'padding-right': 2 },
    ...(colWidths != null && { colWidths }),
  })

export const truncateId = (id: string, len = 12): string =>
  id.length > len ? `${id.slice(0, len)}…` : id

export const statusIcon = (started: boolean | undefined): string =>
  started === true ? chalk.green('●') : chalk.dim('○')

export const wsIcon = (wsState: number | undefined): string => {
  switch (wsState) {
    case 0:
      return chalk.yellow('…')
    case 1:
      return chalk.green('✓')
    case 2:
    case 3:
      return chalk.red('✗')
    default:
      return chalk.dim('–')
  }
}

export const countConnectors = (
  evses: EvseEntry[],
  connectors: ConnectorEntry[]
): { available: number; total: number } => {
  let total = 0
  let available = 0

  if (evses.length > 0) {
    for (const evse of evses) {
      if (evse.evseId > 0) {
        for (const c of evse.evseStatus.connectors) {
          if (c.connectorId > 0) {
            total++
            if (c.connectorStatus.status === OCPP16ChargePointStatus.AVAILABLE) {
              available++
            }
          }
        }
      }
    }
  } else {
    for (const c of connectors) {
      if (c.connectorId > 0) {
        total++
        if (c.connectorStatus.status === OCPP16ChargePointStatus.AVAILABLE) {
          available++
        }
      }
    }
  }

  return { available, total }
}

export const fuzzyTime = (ts: number | undefined): string => {
  if (ts == null) return chalk.dim('–')
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
