export interface AutomaticTransactionGeneratorConfiguration {
  enable: boolean;
  minDuration: number;
  maxDuration: number;
  minDelayBetweenTwoTransactions: number;
  maxDelayBetweenTwoTransactions: number;
  probabilityOfStart: number;
  stopAfterHours: number;
  stopOnConnectionFailure: boolean;
  requireAuthorize?: boolean;
}

export interface Status {
  start?: boolean;
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
  skippedConsecutiveTransactions?: number;
  skippedTransactions?: number;
}
