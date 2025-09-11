import { AppDataSource } from '../data-source.js'

/**
 *
 */
export async function initializeDatabase (): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize()
    console.log('Database connected')
  }
}
