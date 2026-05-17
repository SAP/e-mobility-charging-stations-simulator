import type {
  ChargingStationInfo,
  ChargingStationOptions,
  SimulatorState,
  Statistics,
} from '../types/index.js'

/**
 * Contract exposed by the simulator core to UI servers and UI services. Process-lifecycle helpers used only by the
 * entry point (`shouldAutoStart`, `startUIServer`) and the internal `StopReason` parameter of `stop` are intentionally
 * excluded from this contract.
 */
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
