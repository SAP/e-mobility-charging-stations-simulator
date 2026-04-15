export enum ApplicationProtocol {
  WS = 'ws',
  WSS = 'wss',
}

export enum Protocol {
  UI = 'ui',
}

export interface SimulatorState {
  started: boolean
  templateStatistics: Record<string, TemplateStatistics>
  version: string
}

interface TemplateStatistics {
  added: number
  configured: number
  indexes: number[]
  started: number
}
