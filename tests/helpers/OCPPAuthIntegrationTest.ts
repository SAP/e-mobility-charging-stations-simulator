import type { ChargingStation } from '../../src/charging-station/index.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  Identifier,
} from '../../src/charging-station/ocpp/auth/index.js'

import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  OCPPAuthServiceImpl,
} from '../../src/charging-station/ocpp/auth/index.js'
import { logger } from '../../src/utils/index.js'

export class OCPPAuthIntegrationTest {
  private authService: OCPPAuthServiceImpl
  private chargingStation: ChargingStation

  constructor (chargingStation: ChargingStation) {
    this.chargingStation = chargingStation
    this.authService = new OCPPAuthServiceImpl(chargingStation)
  }

  public async runTests (): Promise<{ failed: number; passed: number; results: string[] }> {
    const results: string[] = []
    let passed = 0
    let failed = 0

    logger.info(
      `${this.chargingStation.logPrefix()} Starting OCPP Authentication Integration Tests`
    )

    try {
      this.testServiceInitialization()
      results.push('✅ Service Initialization - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Service Initialization - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      this.testConfigurationManagement()
      results.push('✅ Configuration Management - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Configuration Management - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      this.testStrategySelection()
      results.push('✅ Strategy Selection Logic - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Strategy Selection Logic - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      await this.testOCPP16AuthFlow()
      results.push('✅ OCPP 1.6 Authentication Flow - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ OCPP 1.6 Authentication Flow - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      await this.testOCPP20AuthFlow()
      results.push('✅ OCPP 2.0 Authentication Flow - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ OCPP 2.0 Authentication Flow - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      await this.testErrorHandling()
      results.push('✅ Error Handling - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Error Handling - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      await this.testCacheOperations()
      results.push('✅ Cache Operations - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Cache Operations - FAILED: ${(error as Error).message}`)
      failed++
    }

    try {
      await this.testPerformanceAndStats()
      results.push('✅ Performance and Statistics - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Performance and Statistics - FAILED: ${(error as Error).message}`)
      failed++
    }

    logger.info(
      `${this.chargingStation.logPrefix()} Integration Tests Complete: ${String(passed)} passed, ${String(failed)} failed`
    )

    return { failed, passed, results }
  }

  private async testCacheOperations (): Promise<void> {
    const testIdentifier: Identifier = {
      type: IdentifierType.LOCAL,
      value: 'CACHE_TEST_ID',
    }

    this.authService.invalidateCache(testIdentifier)
    this.authService.clearCache()
    await this.authService.isLocallyAuthorized(testIdentifier)

    logger.debug(`${this.chargingStation.logPrefix()} Cache operations tested`)
  }

  private testConfigurationManagement (): void {
    const originalConfiguration = this.authService.getConfiguration()

    const updates: Partial<AuthConfiguration> = {
      authorizationTimeout: 60,
      localAuthListEnabled: false,
      maxCacheEntries: 2000,
    }

    this.authService.updateConfiguration(updates)

    const updatedConfiguration = this.authService.getConfiguration()

    if (updatedConfiguration.authorizationTimeout !== 60) {
      throw new Error('Configuration update failed: authorizationTimeout')
    }

    if (updatedConfiguration.localAuthListEnabled) {
      throw new Error('Configuration update failed: localAuthListEnabled')
    }

    if (updatedConfiguration.maxCacheEntries !== 2000) {
      throw new Error('Configuration update failed: maxCacheEntries')
    }

    this.authService.updateConfiguration(originalConfiguration)

    logger.debug(`${this.chargingStation.logPrefix()} Configuration management test completed`)
  }

  private async testErrorHandling (): Promise<void> {
    const invalidIdentifier: Identifier = {
      type: IdentifierType.ISO14443,
      value: '',
    }

    const invalidRequest: AuthRequest = {
      allowOffline: false,
      connectorId: 999,
      context: AuthContext.TRANSACTION_START,
      identifier: invalidIdentifier,
      timestamp: new Date(),
    }

    const result = await this.authService.authenticate(invalidRequest)

    if (result.status === AuthorizationStatus.ACCEPTED) {
      throw new Error('Expected INVALID status for invalid identifier, got ACCEPTED')
    }

    try {
      await this.authService.authorizeWithStrategy('non-existent', invalidRequest)
      throw new Error('Expected error for non-existent strategy')
    } catch (error) {
      if (!(error as Error).message.includes('not found')) {
        throw new Error('Unexpected error message for non-existent strategy')
      }
    }

    logger.debug(`${this.chargingStation.logPrefix()} Error handling verified`)
  }

  private async testOCPP16AuthFlow (): Promise<void> {
    const identifier: Identifier = {
      type: IdentifierType.ISO14443,
      value: 'VALID_ID_123',
    }

    const request: AuthRequest = {
      allowOffline: true,
      connectorId: 1,
      context: AuthContext.TRANSACTION_START,
      identifier,
      timestamp: new Date(),
    }

    const result = await this.authService.authenticate(request)
    this.validateAuthenticationResult(result)

    const authResult = await this.authService.authorize(request)
    this.validateAuthenticationResult(authResult)

    const localResult = await this.authService.isLocallyAuthorized(identifier, 1)
    if (localResult) {
      this.validateAuthenticationResult(localResult)
    }

    logger.debug(`${this.chargingStation.logPrefix()} OCPP 1.6 authentication flow tested`)
  }

  private async testOCPP20AuthFlow (): Promise<void> {
    const identifier: Identifier = {
      type: IdentifierType.ISO15693,
      value: 'VALID_ID_456',
    }

    const request: AuthRequest = {
      allowOffline: false,
      connectorId: 2,
      context: AuthContext.TRANSACTION_START,
      identifier,
      timestamp: new Date(),
    }

    const contexts = [
      AuthContext.TRANSACTION_START,
      AuthContext.TRANSACTION_STOP,
      AuthContext.REMOTE_START,
      AuthContext.REMOTE_STOP,
    ]

    for (const context of contexts) {
      const contextRequest = { ...request, context }
      const result = await this.authService.authenticate(contextRequest)
      this.validateAuthenticationResult(result)
    }

    logger.debug(`${this.chargingStation.logPrefix()} OCPP 2.0 authentication flow tested`)
  }

  private async testPerformanceAndStats (): Promise<void> {
    const connectivity = this.authService.testConnectivity()
    if (typeof connectivity !== 'boolean') {
      throw new Error('Invalid connectivity test result')
    }

    const stats = await this.authService.getStats()
    if (typeof stats.totalRequests !== 'number') {
      throw new Error('Invalid statistics object')
    }

    const authStatistics = this.authService.getAuthenticationStats()
    if (!Array.isArray(authStatistics.availableStrategies)) {
      throw new Error('Invalid authentication statistics')
    }

    const identifier: Identifier = {
      type: IdentifierType.ISO14443,
      value: 'PERF_TEST_ID',
    }

    const startTime = Date.now()
    const promises = []

    for (let i = 0; i < 10; i++) {
      const request: AuthRequest = {
        allowOffline: true,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier: { ...identifier, value: `PERF_TEST_${String(i)}` },
        timestamp: new Date(),
      }
      promises.push(this.authService.authenticate(request))
    }

    const results = await Promise.all(promises)
    const duration = Date.now() - startTime

    if (results.length !== 10) {
      throw new Error('Not all performance test requests completed')
    }

    if (duration > 5000) {
      throw new Error(`Performance test too slow: ${String(duration)}ms for 10 requests`)
    }

    logger.debug(
      `${this.chargingStation.logPrefix()} Performance test: ${String(duration)}ms for 10 requests`
    )
  }

  private testServiceInitialization (): void {
    const strategies = this.authService.getAvailableStrategies()
    if (strategies.length === 0) {
      throw new Error('No authentication strategies available')
    }

    const config = this.authService.getConfiguration()
    if (typeof config !== 'object') {
      throw new Error('Invalid configuration object')
    }

    const stats = this.authService.getAuthenticationStats()
    if (!stats.ocppVersion) {
      throw new Error('Invalid authentication statistics')
    }

    logger.debug(
      `${this.chargingStation.logPrefix()} Service initialized with ${String(strategies.length)} strategies`
    )
  }

  private testStrategySelection (): void {
    const strategies = this.authService.getAvailableStrategies()

    for (const strategyName of strategies) {
      const strategy = this.authService.getStrategy(strategyName)
      if (!strategy) {
        throw new Error(`Strategy '${strategyName}' not found`)
      }
    }

    const testIdentifier: Identifier = {
      type: IdentifierType.ISO14443,
      value: 'TEST123',
    }

    const isSupported = this.authService.isSupported(testIdentifier)
    if (typeof isSupported !== 'boolean') {
      throw new Error('Invalid support detection result')
    }

    logger.debug(`${this.chargingStation.logPrefix()} Strategy selection logic verified`)
  }

  private validateAuthenticationResult (result: AuthorizationResult): void {
    if (typeof result.isOffline !== 'boolean') {
      throw new Error('Authentication result missing or invalid isOffline flag')
    }

    const validStatuses = Object.values(AuthorizationStatus)
    if (!validStatuses.includes(result.status)) {
      throw new Error(`Invalid authorization status: ${result.status}`)
    }

    const validMethods = Object.values(AuthenticationMethod)
    if (!validMethods.includes(result.method)) {
      throw new Error(`Invalid authentication method: ${result.method}`)
    }

    const now = new Date()
    const diff = now.getTime() - result.timestamp.getTime()
    if (diff > 60000) {
      throw new Error(`Authentication timestamp too old: ${String(diff)}ms`)
    }

    if (result.additionalInfo) {
      if (typeof result.additionalInfo !== 'object') {
        throw new Error('Invalid additionalInfo structure')
      }
    }
  }
}

/**
 * Create and run integration tests for a charging station.
 * @param chargingStation - Charging station instance to test
 * @returns Test results with pass/fail counts and outcome messages
 */
export async function runOCPPAuthIntegrationTests (chargingStation: ChargingStation): Promise<{
  failed: number
  passed: number
  results: string[]
}> {
  const tester = new OCPPAuthIntegrationTest(chargingStation)
  return await tester.runTests()
}
