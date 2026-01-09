// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import type { UUIDv4 } from '../../../src/types/index.js'

export const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000' as UUIDv4
export const TEST_UUID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' as UUIDv4

export const TEST_PROCEDURES = {
  AUTHORIZE: 'Authorize',
  DELETE_CHARGING_STATIONS: 'deleteChargingStations',
  LIST_CHARGING_STATIONS: 'listChargingStations',
  START_CHARGING_STATION: 'startChargingStation',
  STOP_CHARGING_STATION: 'stopChargingStation',
} as const

export const TEST_HASH_ID = 'test-station-001' as const
export const TEST_HASH_ID_2 = 'test-station-002' as const
