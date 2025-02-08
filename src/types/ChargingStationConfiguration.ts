import type { ChargingStationAutomaticTransactionGeneratorConfiguration } from './AutomaticTransactionGenerator.js'
import type { ChargingStationInfoConfiguration } from './ChargingStationInfo.js'
import type { ChargingStationOcppConfiguration } from './ChargingStationOcppConfiguration.js'
import type { ConnectorStatus } from './ConnectorStatus.js'
import type { EvseStatus } from './Evse.js'

export type ChargingStationConfiguration =
  ChargingStationAutomaticTransactionGeneratorConfiguration &
    ChargingStationInfoConfiguration &
    ChargingStationOcppConfiguration &
    ConnectorsConfiguration &
    EvsesConfiguration & {
      configurationHash?: string
    }

export type EvseStatusConfiguration = Omit<EvseStatus, 'connectors'> & {
  connectorsStatus?: ConnectorStatus[]
}

interface ConnectorsConfiguration {
  connectorsStatus?: ConnectorStatus[]
}

interface EvsesConfiguration {
  evsesStatus?: EvseStatusConfiguration[]
}
