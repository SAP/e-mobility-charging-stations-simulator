import type { JsonObject } from './JsonType.js'

export enum IdTagDistribution {
  CONNECTOR_AFFINITY = 'connector-affinity',
  RANDOM = 'random',
  ROUND_ROBIN = 'round-robin',
}

export interface AutomaticTransactionGeneratorConfiguration extends JsonObject {
  enable: boolean
  idTagDistribution?: IdTagDistribution
  maxDelayBetweenTwoTransactions: number
  maxDuration: number
  minDelayBetweenTwoTransactions: number
  minDuration: number
  probabilityOfStart: number
  requireAuthorize?: boolean
  stopAbsoluteDuration: boolean
  stopAfterHours: number
}

export interface Status {
  acceptedAuthorizeRequests: number
  acceptedStartTransactionRequests: number
  acceptedStopTransactionRequests: number
  authorizeRequests: number
  lastRunDate?: Date
  rejectedAuthorizeRequests: number
  rejectedStartTransactionRequests: number
  rejectedStopTransactionRequests: number
  skippedConsecutiveTransactions: number
  skippedTransactions: number
  start: boolean
  startDate?: Date
  startTransactionRequests: number
  stopDate?: Date
  stoppedDate?: Date
  stopTransactionRequests: number
}

export interface ChargingStationAutomaticTransactionGeneratorConfiguration {
  automaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration
  automaticTransactionGeneratorStatuses?: Status[]
}
