import { defineConfig } from '@mikro-orm/better-sqlite'

import { PerformanceRecord } from './src/types/orm/entities/PerformanceRecord.js'
import { Constants } from './src/utils/index.js'

export default defineConfig({
  dbName: `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`,
  debug: true,
  entities: [PerformanceRecord],
})
