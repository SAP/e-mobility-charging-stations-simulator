import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator.js'
import type { ChargingStationInfoConfiguration } from './ChargingStationInfo.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorStatus } from './ConnectorStatus.js'
import type { EvseStatus } from './Evse.js'

interface ConnectorsConfiguration {
  connectorsStatus?: ConnectorStatus[]
}

export type EvseStatusConfiguration = Omit<EvseStatus, 'connectors'> & {
  connectorsStatus?: ConnectorStatus[]
}

interface EvsesConfiguration {
  evsesStatus?: EvseStatusConfiguration[]
}

export type ChargingStationConfiguration = ChargingStationInfoConfiguration &
  ChargingStationOcppConfiguration &
  ChargingStationAutomaticTransactionGeneratorConfiguration &
  ConnectorsConfiguration &
  EvsesConfiguration & {
    configurationHash?: string
  }
