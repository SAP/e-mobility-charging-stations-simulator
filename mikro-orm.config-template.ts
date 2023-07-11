import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

import { PerformanceData, PerformanceRecord } from './src/types';
import { Constants } from './src/utils';

export default {
  metadataProvider: TsMorphMetadataProvider,
  entities: [PerformanceRecord, PerformanceData],
  type: 'sqlite',
  clientUrl: `file://${join(
    dirname(fileURLToPath(import.meta.url)),
    `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`,
  )}`,
};
