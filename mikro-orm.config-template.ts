import path from 'path';

import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

import { PerformanceData } from './src/types/orm/entities/PerformanceData';
import { PerformanceRecord } from './src/types/orm/entities/PerformanceRecord';
import Constants from './src/utils/Constants';

export default {
  metadataProvider: TsMorphMetadataProvider,
  entities: [PerformanceRecord, PerformanceData],
  type: 'sqlite',
  clientUrl: `file://${path.join(
    path.resolve(__dirname),
    `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`
  )}`,
};
