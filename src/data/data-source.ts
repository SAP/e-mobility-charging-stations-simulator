import 'reflect-metadata'
import { DataSource } from 'typeorm'

import { Template } from './entity/template.js'

export const AppDataSource = new DataSource({
  database: 'charger_simulator',
  entities: [Template],
  host: 'localhost',
  logging: false,
  password: '1234',
  port: 5434,
  synchronize: true, // Use carefully in dev only
  type: 'postgres',
  username: 'postgres',
})
