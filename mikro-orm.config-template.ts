import { defineConfig } from '@mikro-orm/sqlite'

import { PerformanceData, PerformanceRecord } from './src/types/index.js'
import { Constants } from './src/utils/index.js'

export default defineConfig({
  dbName: `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`,
  entities: [PerformanceRecord, PerformanceData],
  debug: true
})
