export interface Status {
  start?: boolean;
  startDate?: Date;
  lastRunDate?: Date;
  stopDate?: Date;
  stoppedDate?: Date;
  skippedConsecutiveTransactions?: number;
  skippedTransactions?: number;
}
