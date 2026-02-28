/**
 * Utilities for creating MOCK ChargingStation instances in tests
 *
 * This file provides factory functions to instantiate mock ChargingStation
 * objects (lightweight stubs) with properly isolated dependencies for testing.
 *
 * Key patterns:
 * - MockWebSocket: Captures sent messages for assertion
 * - Singleton mocking: Overrides getInstance() for shared caches
 * - Cleanup utilities: Prevents test pollution via timer/listener cleanup
 * @see tests/ChargingStationFactory.ts for mock factory (creates mock objects)
 * @see tests/charging-station/ChargingStationTestConstants.ts for test constants
 */

// Re-export test lifecycle helpers
export {
  clearConnectorTransaction,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../helpers/TestLifecycleHelpers.js'

// Re-export all helper functions and types
export type {
  ChargingStationMocks,
  CreateConnectorStatusOptions,
  MockChargingStationOptions,
  MockChargingStationResult,
  MockOCPPIncomingRequestService,
  MockOCPPRequestService,
} from './helpers/StationHelpers.js'

export {
  cleanupChargingStation,
  createConnectorStatus,
  createMockChargingStation,
  createMockChargingStationTemplate,
  resetChargingStationState,
  waitForCondition,
} from './helpers/StationHelpers.js'


export { MockIdTagsCache, MockSharedLRUCache } from './mocks/MockCaches.js'
// Re-export all mock classes
export { MockWebSocket, WebSocketReadyState } from './mocks/MockWebSocket.js'
