import type { ChargingStation } from '../../../ChargingStation.js'
import type { OCPPAuthService } from '../interfaces/OCPPAuthService.js'

import { OCPPError } from '../../../../exception/OCPPError.js'
import { ErrorType } from '../../../../types/index.js'
import { logger } from '../../../../utils/Logger.js'
import { OCPPAuthServiceImpl } from './OCPPAuthServiceImpl.js'

const moduleName = 'OCPPAuthServiceFactory'

/**
 * Factory for creating OCPP Authentication Services with proper adapter configuration
 *
 * This factory ensures that the correct OCPP version-specific adapters are created
 * and registered with the authentication service, providing a centralized way to
 * instantiate authentication services across the application.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPPAuthServiceFactory {
  private static instances = new Map<string, OCPPAuthService>()

  /**
   * Clear all cached instances
   */
  static clearAllInstances (): void {
    const count = this.instances.size
    this.instances.clear()
    logger.debug(
      `${moduleName}.clearAllInstances: Cleared ${String(count)} cached auth service instances`
    )
  }

  /**
   * Clear cached instance for a charging station
   * @param chargingStation - The charging station to clear cache for
   */
  static clearInstance (chargingStation: ChargingStation): void {
    const stationId = chargingStation.stationInfo?.chargingStationId ?? 'unknown'

    if (this.instances.has(stationId)) {
      this.instances.delete(stationId)
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.clearInstance: Cleared cached auth service for station ${stationId}`
      )
    }
  }

  /**
   * Create a new OCPPAuthService instance without caching
   * @param chargingStation - The charging station to create the service for
   * @returns New OCPPAuthService instance (initialized)
   */
  static async createInstance (chargingStation: ChargingStation): Promise<OCPPAuthService> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.createInstance: Creating new uncached auth service`
    )

    const authService = new OCPPAuthServiceImpl(chargingStation)
    await authService.initialize()

    return authService
  }

  /**
   * Get the number of cached instances
   * @returns Number of cached instances
   */
  static getCachedInstanceCount (): number {
    return this.instances.size
  }

  /**
   * Create or retrieve an OCPPAuthService instance for the given charging station
   * @param chargingStation - The charging station to create the service for
   * @returns Configured OCPPAuthService instance (initialized)
   */
  static async getInstance (chargingStation: ChargingStation): Promise<OCPPAuthService> {
    const stationId = chargingStation.stationInfo?.chargingStationId ?? 'unknown'

    // Return existing instance if available
    if (this.instances.has(stationId)) {
      const existingInstance = this.instances.get(stationId)
      if (!existingInstance) {
        throw new OCPPError(
          ErrorType.INTERNAL_ERROR,
          `${moduleName}.getInstance: No cached instance found for station ${stationId}`
        )
      }
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getInstance: Returning existing auth service for station ${stationId}`
      )
      return existingInstance
    }

    // Create new instance and initialize it
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.getInstance: Creating new auth service for station ${stationId}`
    )

    const authService = new OCPPAuthServiceImpl(chargingStation)
    await authService.initialize()

    // Cache the instance
    this.instances.set(stationId, authService)

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.getInstance: Auth service created and configured for OCPP ${chargingStation.stationInfo?.ocppVersion ?? 'unknown'}`
    )

    return authService
  }

  /**
   * Get statistics about factory usage
   * @returns Factory usage statistics
   */
  static getStatistics (): {
    cachedInstances: number
    stationIds: string[]
  } {
    return {
      cachedInstances: this.instances.size,
      stationIds: Array.from(this.instances.keys()),
    }
  }

  /**
   * Set a cached instance for testing purposes only.
   * This allows tests to inject mock auth services without relying on module internals.
   * @param stationId - The station identifier to cache the instance for
   * @param instance - The auth service instance to cache
   */
  static setInstanceForTesting (stationId: string, instance: OCPPAuthService): void {
    this.instances.set(stationId, instance)
    logger.debug(
      `${moduleName}.setInstanceForTesting: Set mock auth service for station ${stationId}`
    )
  }
}
