import type { JsonObject } from './JsonType.js'

export enum IdTagDistribution {
  RANDOM = 'random',
  ROUND_ROBIN = 'round-robin',
  CONNECTOR_AFFINITY = 'connector-affinity'
}

export interface AutomaticTransactionGeneratorConfiguration extends JsonObject {
  enable: boolean
  minDuration: number
  maxDuration: number
  minDelayBetweenTwoTransactions: number
  maxDelayBetweenTwoTransactions: number
  probabilityOfStart: number
  stopAfterHours: number
  stopAbsoluteDuration: boolean
  requireAuthorize?: boolean
  idTagDistribution?: IdTagDistribution
}

export interface Status {
  start: boolean
  startDate?: Date
  lastRunDate?: Date
  stopDate?: Date
  stoppedDate?: Date
  authorizeRequests: number
  acceptedAuthorizeRequests: number
  rejectedAuthorizeRequests: number
  startTransactionRequests: number
  acceptedStartTransactionRequests: number
  rejectedStartTransactionRequests: number
  stopTransactionRequests: number
  acceptedStopTransactionRequests: number
  rejectedStopTransactionRequests: number
  skippedConsecutiveTransactions: number
  skippedTransactions: number
}

export interface ChargingStationAutomaticTransactionGeneratorConfiguration {
  automaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration
  automaticTransactionGeneratorStatuses?: Status[]
}
