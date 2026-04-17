import type { ConnectorEntry, EvseEntry, ResponsePayload } from 'ui-common'

import chalk from 'chalk'
import process from 'node:process'

import {
  borderlessTable,
  countConnectors,
  fuzzyTime,
  statusIcon,
  truncateId,
  wsIcon,
} from './format.js'

type PerformancePayload = ResponsePayload & {
  performanceStatistics: unknown[]
}

type SimulatorStatePayload = ResponsePayload & {
  state: {
    configuration?: {
      supervisionUrls?: string | string[]
      worker?: { elementsPerWorker?: string; processType?: string }
    }
    started: boolean
    templateStatistics: Record<
      string,
      {
        added: number
        configured: number
        indexes: number[]
        provisioned: number
        started: number
      }
    >
    version: string
  }
}

type StationPayload = ResponsePayload & {
  chargingStations: {
    connectors?: ConnectorEntry[]
    evses?: EvseEntry[]
    started?: boolean
    stationInfo: {
      chargingStationId: string
      hashId: string
      ocppVersion?: string
      templateName?: string
    }
    supervisionUrl?: string
    timestamp?: number
    wsState?: number
  }[]
}

type TemplatePayload = ResponsePayload & {
  templates: string[]
}

const isPerformanceStats = (p: ResponsePayload): p is PerformancePayload =>
  'performanceStatistics' in p && Array.isArray(p.performanceStatistics)

const isSimulatorState = (p: ResponsePayload): p is SimulatorStatePayload => {
  if (!('state' in p) || p.state == null || typeof p.state !== 'object') return false
  const state = p.state as Record<string, unknown>
  return (
    'version' in state &&
    'templateStatistics' in state &&
    typeof state.templateStatistics === 'object' &&
    state.templateStatistics != null
  )
}

const isStationList = (p: ResponsePayload): p is StationPayload =>
  'chargingStations' in p && Array.isArray(p.chargingStations)

const isTemplateList = (p: ResponsePayload): p is TemplatePayload =>
  'templates' in p && Array.isArray(p.templates)

const renderPerformanceStats = (payload: PerformancePayload): void => {
  const stats = payload.performanceStatistics
  if (stats.length === 0) {
    process.stdout.write(chalk.dim('No performance statistics collected\n'))
    return
  }
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n')
}

const renderSimulatorState = (payload: SimulatorStatePayload): void => {
  const { state } = payload
  const stats = state.templateStatistics

  process.stdout.write(chalk.bold('Simulator\n'))
  process.stdout.write(
    `  Status     ${statusIcon(state.started)} ${state.started ? 'started' : 'stopped'}\n`
  )
  process.stdout.write(`  Version    ${state.version}\n`)
  if (state.configuration?.worker != null) {
    const w = state.configuration.worker
    process.stdout.write(`  Worker     ${w.processType ?? '–'} (${w.elementsPerWorker ?? '–'})\n`)
  }
  if (
    state.configuration?.supervisionUrls != null &&
    state.configuration.supervisionUrls.length > 0
  ) {
    const urls = Array.isArray(state.configuration.supervisionUrls)
      ? state.configuration.supervisionUrls
      : [state.configuration.supervisionUrls]
    process.stdout.write(`  CSMS       ${chalk.dim(urls.join(', '))}\n`)
  }

  const activeTemplates = Object.entries(stats).filter(([, s]) => s.added > 0 || s.provisioned > 0)
  if (activeTemplates.length > 0) {
    process.stdout.write(chalk.bold('\nTemplates\n'))
    const table = borderlessTable(['Name', 'Added', 'Started', 'Provisioned', 'Configured'])
    for (const [name, s] of activeTemplates) {
      table.push([
        name.replace('.station-template', ''),
        s.added > 0 ? chalk.green(s.added.toString()) : chalk.dim('0'),
        s.started > 0 ? chalk.green(s.started.toString()) : chalk.dim('0'),
        s.provisioned > 0 ? s.provisioned.toString() : chalk.dim('0'),
        s.configured > 0 ? s.configured.toString() : chalk.dim('0'),
      ])
    }
    process.stdout.write(`${table.toString()}\n`)
  }

  const totalAdded = Object.values(stats).reduce((sum, s) => sum + s.added, 0)
  const totalStarted = Object.values(stats).reduce((sum, s) => sum + s.started, 0)
  process.stdout.write(
    chalk.dim(
      `\n${totalAdded.toString()} station${totalAdded !== 1 ? 's' : ''} added, ${totalStarted.toString()} started\n`
    )
  )
}

const renderStationList = (payload: StationPayload): void => {
  const stations = payload.chargingStations
  if (stations.length === 0) {
    process.stdout.write(chalk.dim('No charging stations\n'))
    return
  }

  const table = borderlessTable(['', 'Name', 'Hash ID', 'WS', 'OCPP', 'Template', 'Updated'])
  for (const cs of stations) {
    const si = cs.stationInfo
    const { available, total } = countConnectors(cs.evses ?? [], cs.connectors ?? [])
    table.push([
      statusIcon(cs.started),
      si.chargingStationId,
      chalk.dim(truncateId(si.hashId)),
      `${wsIcon(cs.wsState)} ${chalk.dim(`${available.toString()}/${total.toString()}`)}`,
      chalk.dim(si.ocppVersion ?? '–'),
      chalk.dim(si.templateName?.replace('.station-template', '') ?? '–'),
      fuzzyTime(cs.timestamp),
    ])
  }
  process.stdout.write(`${table.toString()}\n`)

  const started = stations.filter(s => s.started === true).length
  const connected = stations.filter(s => s.wsState === 1).length
  process.stdout.write(
    chalk.dim(
      `\n${stations.length.toString()} station${stations.length !== 1 ? 's' : ''} (${started.toString()} started, ${connected.toString()} connected)\n`
    )
  )
}

const renderTemplateList = (payload: TemplatePayload): void => {
  const templates = payload.templates
  if (templates.length === 0) {
    process.stdout.write(chalk.dim('No templates available\n'))
    return
  }
  for (const t of templates) {
    process.stdout.write(`${t}\n`)
  }
  process.stdout.write(
    chalk.dim(`\n${templates.length.toString()} template${templates.length !== 1 ? 's' : ''}\n`)
  )
}

export const tryRenderPayload = (payload: ResponsePayload): boolean => {
  if (isStationList(payload)) {
    renderStationList(payload)
    return true
  }
  if (isTemplateList(payload)) {
    renderTemplateList(payload)
    return true
  }
  if (isSimulatorState(payload)) {
    renderSimulatorState(payload)
    return true
  }
  if (isPerformanceStats(payload)) {
    renderPerformanceStats(payload)
    return true
  }
  return false
}
