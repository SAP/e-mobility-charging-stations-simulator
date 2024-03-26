import type { ConfigurationData } from './ConfigurationData.js'
import type { TemplateStatistics } from './Statistics.js'

export interface SimulatorState {
  version: string
  configuration: ConfigurationData | undefined
  started: boolean
  templateStatistics: Map<string, TemplateStatistics>
}
