import type { ChargingStationData, ResponsePayload } from 'ui-common'

export interface GlobalOptions {
  config?: string
  json: boolean
  serverUrl?: string
}

export type StationListPayload = ResponsePayload & {
  chargingStations: ChargingStationData[]
}
