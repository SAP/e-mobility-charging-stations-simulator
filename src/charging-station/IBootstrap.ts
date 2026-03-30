import type {
  ChargingStationInfo,
  ChargingStationOptions,
  SimulatorState,
  Statistics,
} from '../types/index.js'

export interface IBootstrap {
  addChargingStation(
    index: number,
    templateFile: string,
    options?: ChargingStationOptions
  ): Promise<ChargingStationInfo | undefined>
  getLastContiguousIndex(templateName: string): number
  getPerformanceStatistics(): IterableIterator<Statistics> | undefined
  getState(): SimulatorState
  start(): Promise<void>
  stop(): Promise<void>
}
