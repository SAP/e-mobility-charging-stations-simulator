import type { TemplateStatistics } from './Statistics.js'

export interface SimulatorState {
  version: string
  started: boolean
  templateStatistics: Map<string, TemplateStatistics>
}
