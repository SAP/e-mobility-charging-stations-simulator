import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator.js'
import type { ChargingStationInfoConfiguration } from './ChargingStationInfo.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorStatus } from './ConnectorStatus.js'
import type { EvseStatus } from './Evse.js'

interface ConnectorsConfiguration {
  connectorsStatus?: ConnectorStatus[]
}

export type EvseStatusConfiguration = {
  connectorsStatus?: ConnectorStatus[]
} & Omit<EvseStatus, 'connectors'>

interface EvsesConfiguration {
  evsesStatus?: EvseStatusConfiguration[]
}

export type ChargingStationConfiguration = {
  configurationHash?: string
} & ChargingStationAutomaticTransactionGeneratorConfiguration &
  ChargingStationInfoConfiguration &
  ChargingStationOcppConfiguration &
  ConnectorsConfiguration &
  EvsesConfiguration
