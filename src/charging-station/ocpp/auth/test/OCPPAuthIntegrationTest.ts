/**
 * Integration Test for OCPP Authentication Service
 * Tests the complete authentication flow end-to-end
 */

import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import { logger } from '../../../../utils/Logger.js'
import { ChargingStation } from '../../../ChargingStation.js'
import { OCPPAuthServiceImpl } from '../services/OCPPAuthServiceImpl.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../types/AuthTypes.js'

/**
 * Integration test class for OCPP Authentication
 */
export class OCPPAuthIntegrationTest {
  private authService: OCPPAuthServiceImpl
  private chargingStation: ChargingStation

  constructor (chargingStation: ChargingStation) {
    this.chargingStation = chargingStation
    this.authService = new OCPPAuthServiceImpl(chargingStation)
  }

  /**
   * Run comprehensive integration test suite
   */
  public async runTests (): Promise<{ failed: number; passed: number; results: string[] }> {
    const results: string[] = []
    let passed = 0
    let failed = 0

    logger.info(
      `${this.chargingStation.logPrefix()} Starting OCPP Authentication Integration Tests`
    )

    // Test 1: Service Initialization
    try {
      await this.testServiceInitialization()
      results.push('✅ Service Initialization - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Service Initialization - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 2: Configuration Management
    try {
      await this.testConfigurationManagement()
      results.push('✅ Configuration Management - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Configuration Management - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 3: Strategy Selection Logic
    try {
      await this.testStrategySelection()
      results.push('✅ Strategy Selection Logic - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Strategy Selection Logic - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 4: OCPP 1.6 Authentication Flow
    try {
      await this.testOCPP16AuthFlow()
      results.push('✅ OCPP 1.6 Authentication Flow - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ OCPP 1.6 Authentication Flow - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 5: OCPP 2.0 Authentication Flow
    try {
      await this.testOCPP20AuthFlow()
      results.push('✅ OCPP 2.0 Authentication Flow - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ OCPP 2.0 Authentication Flow - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 6: Error Handling
    try {
      await this.testErrorHandling()
      results.push('✅ Error Handling - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Error Handling - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 7: Cache Operations
    try {
      await this.testCacheOperations()
      results.push('✅ Cache Operations - PASSED')
      passed++
    } catch (error) {
      results.push(`❌ Cache Operations - FAILED: ${(error as Error).message}`)
      failed++
    }

    // Test 8: Performance and Statistics
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

  /**
   * Test 7: Cache Operations
   */
  private async testCacheOperations (): Promise<void> {
    const testIdentifier: UnifiedIdentifier = {
      ocppVersion:
        this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_16
          ? OCPPVersion.VERSION_16
          : OCPPVersion.VERSION_201,
      type: IdentifierType.LOCAL,
      value: 'CACHE_TEST_ID',
    }

    // Test cache invalidation (should not throw)
    await this.authService.invalidateCache(testIdentifier)

    // Test cache clearing (should not throw)
    await this.authService.clearCache()

    // Test local authorization check after cache operations
    await this.authService.isLocallyAuthorized(testIdentifier)
    // Result can be undefined, which is valid

    logger.debug(`${this.chargingStation.logPrefix()} Cache operations tested`)
  }

  /**
   * Test 2: Configuration Management
   */
  private async testConfigurationManagement (): Promise<void> {
    const originalConfig = this.authService.getConfiguration()

    // Test configuration update
    const updates: Partial<AuthConfiguration> = {
      authorizationTimeout: 60,
      localAuthListEnabled: false,
      maxCacheEntries: 2000,
    }

    await this.authService.updateConfiguration(updates)

    const updatedConfig = this.authService.getConfiguration()

    // Verify updates applied
    if (updatedConfig.authorizationTimeout !== 60) {
      throw new Error('Configuration update failed: authorizationTimeout')
    }

    if (updatedConfig.localAuthListEnabled) {
      throw new Error('Configuration update failed: localAuthListEnabled')
    }

    if (updatedConfig.maxCacheEntries !== 2000) {
      throw new Error('Configuration update failed: maxCacheEntries')
    }

    // Restore original configuration
    await this.authService.updateConfiguration(originalConfig)

    logger.debug(`${this.chargingStation.logPrefix()} Configuration management test completed`)
  }

  /**
   * Test 6: Error Handling
   */
  private async testErrorHandling (): Promise<void> {
    // Test with invalid identifier
    const invalidIdentifier: UnifiedIdentifier = {
      ocppVersion: OCPPVersion.VERSION_16,
      type: IdentifierType.ISO14443,
      value: '',
    }

    const invalidRequest: AuthRequest = {
      allowOffline: false,
      connectorId: 999, // Invalid connector
      context: AuthContext.TRANSACTION_START,
      identifier: invalidIdentifier,
      timestamp: new Date(),
    }

    const result = await this.authService.authenticate(invalidRequest)

    // Should get INVALID status for invalid request
    if (result.status === AuthorizationStatus.ACCEPTED) {
      throw new Error('Expected INVALID status for invalid identifier, got ACCEPTED')
    }

    // Test strategy-specific authorization with non-existent strategy
    try {
      await this.authService.authorizeWithStrategy('non-existent', invalidRequest)
      throw new Error('Expected error for non-existent strategy')
    } catch (error) {
      // Expected behavior - should throw error
      if (!(error as Error).message.includes('not found')) {
        throw new Error('Unexpected error message for non-existent strategy')
      }
    }

    logger.debug(`${this.chargingStation.logPrefix()} Error handling verified`)
  }

  /**
   * Test 4: OCPP 1.6 Authentication Flow
   */
  private async testOCPP16AuthFlow (): Promise<void> {
    // Create test request for OCPP 1.6
    const identifier: UnifiedIdentifier = {
      ocppVersion: OCPPVersion.VERSION_16,
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

    // Test main authentication method
    const result = await this.authService.authenticate(request)
    this.validateAuthenticationResult(result)

    // Test direct authorization method
    const authResult = await this.authService.authorize(request)
    this.validateAuthenticationResult(authResult)

    // Test local authorization check
    const localResult = await this.authService.isLocallyAuthorized(identifier, 1)
    if (localResult) {
      this.validateAuthenticationResult(localResult)
    }

    logger.debug(`${this.chargingStation.logPrefix()} OCPP 1.6 authentication flow tested`)
  }

  /**
   * Test 5: OCPP 2.0 Authentication Flow
   */
  private async testOCPP20AuthFlow (): Promise<void> {
    // Create test request for OCPP 2.0
    const identifier: UnifiedIdentifier = {
      ocppVersion: OCPPVersion.VERSION_20,
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

    // Test authentication with different contexts
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

  /**
   * Test 8: Performance and Statistics
   */
  private async testPerformanceAndStats (): Promise<void> {
    // Test connectivity check
    const connectivity = await this.authService.testConnectivity()
    if (typeof connectivity !== 'boolean') {
      throw new Error('Invalid connectivity test result')
    }

    // Test statistics retrieval
    const stats = await this.authService.getStats()
    if (typeof stats.totalRequests !== 'number') {
      throw new Error('Invalid statistics object')
    }

    // Test authentication statistics
    const authStats = this.authService.getAuthenticationStats()
    if (!Array.isArray(authStats.availableStrategies)) {
      throw new Error('Invalid authentication statistics')
    }

    // Performance test - multiple rapid authentication requests
    const identifier: UnifiedIdentifier = {
      ocppVersion:
        this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_16
          ? OCPPVersion.VERSION_16
          : OCPPVersion.VERSION_20,
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

    // Verify all requests completed
    if (results.length !== 10) {
      throw new Error('Not all performance test requests completed')
    }

    // Check reasonable performance (less than 5 seconds for 10 requests)
    if (duration > 5000) {
      throw new Error(`Performance test too slow: ${String(duration)}ms for 10 requests`)
    }

    logger.debug(
      `${this.chargingStation.logPrefix()} Performance test: ${String(duration)}ms for 10 requests`
    )
  }

  /**
   * Test 1: Service Initialization
   */
  private testServiceInitialization (): Promise<void> {
    // Service is always initialized in constructor, no need to check

    // Check available strategies
    const strategies = this.authService.getAvailableStrategies()
    if (strategies.length === 0) {
      throw new Error('No authentication strategies available')
    }

    // Check configuration
    const config = this.authService.getConfiguration()
    if (typeof config !== 'object') {
      throw new Error('Invalid configuration object')
    }

    // Check stats
    const stats = this.authService.getAuthenticationStats()
    if (!stats.ocppVersion) {
      throw new Error('Invalid authentication statistics')
    }

    logger.debug(
      `${this.chargingStation.logPrefix()} Service initialized with ${String(strategies.length)} strategies`
    )

    return Promise.resolve()
  }

  /**
   * Test 3: Strategy Selection Logic
   */
  private testStrategySelection (): Promise<void> {
    const strategies = this.authService.getAvailableStrategies()

    // Test each strategy individually
    for (const strategyName of strategies) {
      const strategy = this.authService.getStrategy(strategyName)
      if (!strategy) {
        throw new Error(`Strategy '${strategyName}' not found`)
      }
    }

    // Test identifier support detection
    const testIdentifier: UnifiedIdentifier = {
      ocppVersion:
        this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_16
          ? OCPPVersion.VERSION_16
          : OCPPVersion.VERSION_20,
      type: IdentifierType.ISO14443,
      value: 'TEST123',
    }

    const isSupported = this.authService.isSupported(testIdentifier)
    if (typeof isSupported !== 'boolean') {
      throw new Error('Invalid support detection result')
    }

    logger.debug(`${this.chargingStation.logPrefix()} Strategy selection logic verified`)

    return Promise.resolve()
  }

  /**
   * Validate authentication result structure
   * @param result
   */
  private validateAuthenticationResult (result: AuthorizationResult): void {
    // Note: status, method, and timestamp are required by the AuthorizationResult interface
    // so no null checks are needed - they are guaranteed by TypeScript

    if (typeof result.isOffline !== 'boolean') {
      throw new Error('Authentication result missing or invalid isOffline flag')
    }

    // Validate status is valid enum value
    const validStatuses = Object.values(AuthorizationStatus)
    if (!validStatuses.includes(result.status)) {
      throw new Error(`Invalid authorization status: ${result.status}`)
    }

    // Validate method is valid enum value
    const validMethods = Object.values(AuthenticationMethod)
    if (!validMethods.includes(result.method)) {
      throw new Error(`Invalid authentication method: ${result.method}`)
    }

    // Check timestamp is recent (within last minute)
    const now = new Date()
    const diff = now.getTime() - result.timestamp.getTime()
    if (diff > 60000) {
      // 60 seconds
      throw new Error(`Authentication timestamp too old: ${String(diff)}ms`)
    }

    // Check additional info structure if present
    if (result.additionalInfo) {
      if (typeof result.additionalInfo !== 'object') {
        throw new Error('Invalid additionalInfo structure')
      }
    }
  }
}

/**
 * Factory function to create and run integration tests
 * @param chargingStation
 */
export async function runOCPPAuthIntegrationTests (chargingStation: ChargingStation): Promise<{
  failed: number
  passed: number
  results: string[]
}> {
  const tester = new OCPPAuthIntegrationTest(chargingStation)
  return await tester.runTests()
}
