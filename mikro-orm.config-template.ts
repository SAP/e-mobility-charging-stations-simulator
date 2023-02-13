import path from 'node:path';

import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

import { PerformanceData, PerformanceRecord } from './src/types';
import { Constants } from './src/utils';

export default {
  metadataProvider: TsMorphMetadataProvider,
  entities: [PerformanceRecord, PerformanceData],
  type: 'sqlite',
  clientUrl: `file://${path.join(
    path.resolve(__dirname),
    `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`
  )}`,
};
