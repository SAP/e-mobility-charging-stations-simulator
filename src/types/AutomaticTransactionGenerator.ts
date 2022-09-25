export enum IdTagDistribution {
  RANDOM = 'random',
  ROUND_ROBIN = 'round-robin',
  CONNECTOR_AFFINITY = 'connector-affinity',
}

export type AutomaticTransactionGeneratorConfiguration = {
  enable: boolean;
  minDuration: number;
  maxDuration: number;
  minDelayBetweenTwoTransactions: number;
  maxDelayBetweenTwoTransactions: number;
  probabilityOfStart: number;
  stopAfterHours: number;
  stopOnConnectionFailure: boolean;
  requireAuthorize?: boolean;
  idTagDistribution?: IdTagDistribution;
};

export type Status = {
  start: boolean;
  startDate?: Date;
  lastRunDate?: Date;
  stopDate?: Date;
  stoppedDate?: Date;
  authorizeRequests?: number;
  acceptedAuthorizeRequests?: number;
  rejectedAuthorizeRequests?: number;
  startTransactionRequests?: number;
  acceptedStartTransactionRequests?: number;
  rejectedStartTransactionRequests?: number;
  stopTransactionRequests?: number;
  acceptedStopTransactionRequests?: number;
  rejectedStopTransactionRequests?: number;
  skippedConsecutiveTransactions?: number;
  skippedTransactions?: number;
};

export type ChargingStationAutomaticTransactionGeneratorConfiguration = {
  automaticTransactionGenerator?: AutomaticTransactionGeneratorConfiguration;
  automaticTransactionGeneratorStatuses?: Status[];
};
