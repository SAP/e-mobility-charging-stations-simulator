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
};

export type Status = {
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
};
