/**
 * @file Test data factories for Vue.js web UI unit tests
 * @description Factory functions (NOT static objects) for ChargingStationData,
 *   ConnectorStatus, and other test fixtures. Using factories prevents shared state.
 */
import {
  type ChargingStationData,
  type ChargingStationInfo,
  type ConnectorStatus,
  type EvseEntry,
  OCPP16AvailabilityType,
  OCPP16ChargePointStatus,
  OCPP16RegistrationStatus,
  OCPPVersion,
  Protocol,
  ProtocolVersion,
  type UIServerConfigurationSection,
} from '@/types'

// ── Shared Test Constants ─────────────────────────────────────────────────────

export const TEST_HASH_ID = 'test-hash-id-abc123'
export const TEST_ID_TAG = 'RFID-TAG-001'
export const TEST_STATION_ID = 'CS-TEST-001'
export const TEST_WS_URL = 'ws://localhost:8080'

// ── Factory Functions ─────────────────────────────────────────────────────────

/**
 * Creates a ChargingStationData fixture with sensible defaults.
 * @param overrides - Optional partial overrides for the fixture
 * @returns ChargingStationData fixture
 */
export function createChargingStationData (
  overrides?: Partial<ChargingStationData>
): ChargingStationData {
  return {
    bootNotificationResponse: {
      currentTime: new Date('2024-01-01T00:00:00Z'),
      interval: 60,
      status: OCPP16RegistrationStatus.ACCEPTED,
    },
    connectors: [{ connector: createConnectorStatus(), connectorId: 1 }],
    ocppConfiguration: { configurationKey: [] },
    started: true,
    stationInfo: createStationInfo(),
    supervisionUrl: 'ws://supervisor.example.com:9000',
    wsState: WebSocket.OPEN,
    ...overrides,
  }
}

/**
 * Creates a ConnectorStatus fixture with sensible defaults.
 * @param overrides - Optional partial overrides for the fixture
 * @returns ConnectorStatus fixture
 */
export function createConnectorStatus (overrides?: Partial<ConnectorStatus>): ConnectorStatus {
  return {
    availability: OCPP16AvailabilityType.OPERATIVE,
    status: OCPP16ChargePointStatus.AVAILABLE,
    ...overrides,
  }
}

/**
 * Creates an EvseEntry fixture with nested connector.
 * @param overrides - Optional partial overrides for the fixture
 * @returns EvseEntry fixture
 */
export function createEvseEntry (overrides?: Partial<EvseEntry>): EvseEntry {
  return {
    availability: OCPP16AvailabilityType.OPERATIVE,
    connectors: [{ connector: createConnectorStatus(), connectorId: 1 }],
    evseId: 1,
    ...overrides,
  }
}

/**
 * Creates a ChargingStationInfo fixture with sensible defaults.
 * @param overrides - Optional partial overrides for the fixture
 * @returns ChargingStationInfo fixture
 */
export function createStationInfo (overrides?: Partial<ChargingStationInfo>): ChargingStationInfo {
  return {
    baseName: 'CS-TEST',
    chargePointModel: 'TestModel',
    chargePointVendor: 'TestVendor',
    chargingStationId: TEST_STATION_ID,
    firmwareVersion: '1.0.0',
    hashId: TEST_HASH_ID,
    ocppVersion: OCPPVersion.VERSION_16,
    templateIndex: 0,
    templateName: 'template-test.json',
    ...overrides,
  }
}

/**
 * Creates a UIServerConfigurationSection fixture with sensible defaults.
 * @param overrides - Optional partial overrides for the fixture
 * @returns UIServerConfigurationSection fixture
 */
export function createUIServerConfig (
  overrides?: Partial<UIServerConfigurationSection>
): UIServerConfigurationSection {
  return {
    host: 'localhost',
    port: 8080,
    protocol: Protocol.UI,
    version: ProtocolVersion['0.0.1'],
    ...overrides,
  }
}
