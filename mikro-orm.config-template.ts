import { defineConfig } from '@mikro-orm/sqlite'

import { Constants } from './src/utils/index.js'

export default defineConfig({
  dbName: `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`,
  entities: ['./dist/types/orm/entities/*.js'],
  entitiesTs: ['./src/types/orm/entities/*.ts'],
  debug: true,
})
