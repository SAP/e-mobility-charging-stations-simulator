/**
 * Common test constants for charging station tests across all OCPP versions
 *
 * This file serves as the single source of truth for test constants used across
 * charging station test suites. Constants are organized by functional area and
 * follow naming conventions: UPPERCASE_WITH_UNDERSCORES.
 * @see tests/charging-station/ocpp/2.0/OCPP20TestConstants.ts for OCPP 2.0 specific constants
 * @see tests/charging-station/OCPPSpecRequirements.md for OCPP specification requirements
 */

/**
 * Test Station Identifiers
 * Base identifiers used for creating test charging station instances
 */
export const TEST_CHARGING_STATION_BASE_NAME = 'CS-TEST'
export const TEST_CHARGING_STATION_HASH_ID = 'cs-test-hash-001'

/**
 * Timer Intervals (seconds)
 * Test values for timing-related configuration and expectations
 */
export const TEST_HEARTBEAT_INTERVAL_SECONDS = 60
export const TEST_HEARTBEAT_INTERVAL_MS = 30000
export const TEST_AUTHORIZATION_TIMEOUT_MS = 30000
export const TEST_ONE_HOUR_MS = 3600000

/**
 * Charging Station Information
 * Test values for charging station metadata
 */
export const TEST_CHARGE_POINT_MODEL = 'Test Model'
export const TEST_CHARGE_POINT_SERIAL_NUMBER = 'TEST-SN-001'
export const TEST_CHARGE_POINT_VENDOR = 'Test Vendor'
export const TEST_FIRMWARE_VERSION = '1.0.0'

/**
 * Test Status Notification Constants
 * Dedicated values for status notification tests
 */
export const TEST_STATUS_CHARGING_STATION_BASE_NAME = 'CS-TEST-STATUS'
export const TEST_STATUS_CHARGE_POINT_MODEL = 'Test Status Model'
export const TEST_STATUS_CHARGE_POINT_SERIAL_NUMBER = 'TEST-STATUS-SN-001'
export const TEST_STATUS_CHARGE_POINT_VENDOR = 'Test Status Vendor'

/**
 * Connector IDs
 * Test values for connector addressing
 */
export const TEST_CONNECTOR_ID_VALID_INSTANCE = '1'

/**
 * Test ID Tags
 * Test values for authentication and authorization
 */
export const TEST_ID_TAG = 'TEST-TAG-001'
export const TEST_ID_TAG_VALID = 'VALID_TAG'
export const TEST_ID_TAG_INVALID = 'INVALID_TAG'
export const TEST_ID_TAG_BLOCKED = 'BLOCKED_TAG'

/**
 * Test Transaction Values
 * Test values for transaction-related operations
 */
export const TEST_TRANSACTION_ID = 1
export const TEST_TRANSACTION_ENERGY_WH = 5000

/**
 * Test Token Values (OCPP 2.0)
 * Test values for IdToken-based authentication
 */
export const TEST_TOKEN_ISO14443 = 'TEST_RFID_TOKEN_001'
export const TEST_TOKEN_EMAID = 'DE*ABC*E123456*1'
export const TEST_TOKEN_CENTRAL = 'CENTRAL_TOKEN_001'
