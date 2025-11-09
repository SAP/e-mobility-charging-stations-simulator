import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { getHashId } from '../src/charging-station/Helpers.js'
import { AvailabilityType, ConnectorStatusEnum, OCPPVersion } from '../src/types/index.js'
import { createChargingStation, createChargingStationTemplate } from './ChargingStationFactory.js'

await describe('ChargingStationFactory', async () => {
  await describe('OCPP Service Mocking', async () => {
    await it('Should throw error when OCPPRequestService.requestHandler is not mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppRequestService.requestHandler()
      ).rejects.toThrow(
        'ocppRequestService.requestHandler not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should throw error when OCPPIncomingRequestService.stop is not mocked', () => {
      const station = createChargingStation({ connectorsCount: 1 })

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(station as any).ocppIncomingRequestService.stop()
      }).toThrow(
        'ocppIncomingRequestService.stop not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should allow custom OCPPRequestService.requestHandler mock', async () => {
      const mockRequestHandler = async () => {
        return Promise.resolve({ success: true })
      }

      const station = createChargingStation({
        connectorsCount: 1,
        ocppRequestService: {
          requestHandler: mockRequestHandler,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const result = await (station as any).ocppRequestService.requestHandler()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(result.success).toBe(true)
    })

    await it('Should allow custom OCPPIncomingRequestService.stop mock', () => {
      let stopCalled = false
      const station = createChargingStation({
        connectorsCount: 1,
        ocppIncomingRequestService: {
          stop: () => {
            stopCalled = true
          },
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      ;(station as any).ocppIncomingRequestService.stop()
      expect(stopCalled).toBe(true)
    })

    await it('Should throw error when OCPPRequestService.sendError is not mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppRequestService.sendError()
      ).rejects.toThrow(
        'ocppRequestService.sendError not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should throw error when OCPPRequestService.sendResponse is not mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppRequestService.sendResponse()
      ).rejects.toThrow(
        'ocppRequestService.sendResponse not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should allow custom OCPPRequestService.sendError mock', async () => {
      const mockSendError = async () => {
        return Promise.resolve({ error: 'test-error' })
      }

      const station = createChargingStation({
        connectorsCount: 1,
        ocppRequestService: {
          sendError: mockSendError,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const result = await (station as any).ocppRequestService.sendError()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(result.error).toBe('test-error')
    })

    await it('Should allow custom OCPPRequestService.sendResponse mock', async () => {
      const mockSendResponse = async () => {
        return Promise.resolve({ response: 'test-response' })
      }

      const station = createChargingStation({
        connectorsCount: 1,
        ocppRequestService: {
          sendResponse: mockSendResponse,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const result = await (station as any).ocppRequestService.sendResponse()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(result.response).toBe('test-response')
    })

    await it('Should throw error when OCPPIncomingRequestService.incomingRequestHandler is not mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppIncomingRequestService.incomingRequestHandler()
      ).rejects.toThrow(
        'ocppIncomingRequestService.incomingRequestHandler not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should allow custom OCPPIncomingRequestService.incomingRequestHandler mock', async () => {
      const mockIncomingRequestHandler = async () => {
        return Promise.resolve({ handled: true })
      }

      const station = createChargingStation({
        connectorsCount: 1,
        ocppIncomingRequestService: {
          incomingRequestHandler: mockIncomingRequestHandler,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const result = await (station as any).ocppIncomingRequestService.incomingRequestHandler()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(result.handled).toBe(true)
    })
  })

  await describe('Configuration Validation', async () => {
    await describe('StationInfo Properties', async () => {
      await it('Should create station with valid stationInfo', () => {
        const station = createChargingStation({
          connectorsCount: 1,
          stationInfo: {
            baseName: 'test-base',
            chargingStationId: 'test-station-001',
            hashId: 'test-hash',
            ocppVersion: OCPPVersion.VERSION_16,
            templateHash: 'template-hash-123',
          },
        })

        expect(station.stationInfo?.chargingStationId).toBe('test-station-001')
        expect(station.stationInfo?.hashId).toBe('test-hash')
        expect(station.stationInfo?.baseName).toBe('test-base')
        expect(station.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_16)
        expect(station.stationInfo?.templateHash).toBe('template-hash-123')
      })
    })

    await describe('Connector Configuration', async () => {
      await it('Should create station with no connectors when connectorsCount is 0', () => {
        const station = createChargingStation({
          connectorsCount: 0,
        })

        // Verify no connectors exist (connector map should be empty except for connector 0 if EVSEs are used)
        expect(station.connectors.size).toBe(0)
      })

      await it('Should create station with specified number of connectors', () => {
        const station = createChargingStation({
          connectorsCount: 3,
        })

        // Should have 4 connectors (0, 1, 2, 3) when not using EVSEs
        expect(station.connectors.size).toBe(4)
      })

      await it('Should handle connector status properly', () => {
        const station = createChargingStation({
          connectorsCount: 2,
        })

        // Verify connectors are properly initialized
        expect(station.getConnectorStatus(1)).toBeDefined()
        expect(station.getConnectorStatus(2)).toBeDefined()
      })

      await it('Should create station with custom connector defaults', () => {
        const station = createChargingStation({
          connectorDefaults: {
            availability: AvailabilityType.Inoperative,
            status: ConnectorStatusEnum.Unavailable,
          },
          connectorsCount: 1,
        })

        const connectorStatus = station.getConnectorStatus(1)
        expect(connectorStatus?.availability).toBe(AvailabilityType.Inoperative)
        expect(connectorStatus?.status).toBe(ConnectorStatusEnum.Unavailable)
      })
    })

    await describe('OCPP Version-Specific Configuration', async () => {
      await it('Should configure OCPP 1.6 station correctly', () => {
        const station = createChargingStation({
          connectorsCount: 2,
          stationInfo: {
            ocppVersion: OCPPVersion.VERSION_16,
          },
        })

        expect(station.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_16)
        expect(station.connectors.size).toBe(3) // 0 + 2 connectors
        expect(station.hasEvses).toBe(false)
      })

      await it('Should configure OCPP 2.0 station with EVSEs', () => {
        const station = createChargingStation({
          connectorsCount: 0, // OCPP 2.0 uses EVSEs instead of connectors
          stationInfo: {
            ocppVersion: OCPPVersion.VERSION_20,
          },
        })

        expect(station.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_20)
        expect(station.connectors.size).toBe(0)
        expect(station.hasEvses).toBe(true)
      })

      await it('Should configure OCPP 2.0.1 station with EVSEs', () => {
        const station = createChargingStation({
          connectorsCount: 0, // OCPP 2.0.1 uses EVSEs instead of connectors
          stationInfo: {
            ocppVersion: OCPPVersion.VERSION_201,
          },
        })

        expect(station.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_201)
        expect(station.connectors.size).toBe(0)
        expect(station.hasEvses).toBe(true)
      })
    })

    await describe('EVSE Configuration', async () => {
      await it('Should create station with EVSEs when configuration is provided', () => {
        const station = createChargingStation({
          connectorsCount: 6,
          evseConfiguration: {
            evsesCount: 2,
          },
        })

        expect(station.hasEvses).toBe(true)
        expect(station.evses.size).toBe(2)
        expect(station.connectors.size).toBe(7) // 0 + 6 connectors
      })

      await it('Should automatically enable EVSEs for OCPP 2.0+ versions', () => {
        const station = createChargingStation({
          connectorsCount: 3,
          stationInfo: {
            ocppVersion: OCPPVersion.VERSION_201,
          },
        })

        expect(station.hasEvses).toBe(true)
        expect(station.connectors.size).toBe(4) // 0 + 3 connectors
      })
    })

    await describe('Factory Default Values', async () => {
      await it('Should provide sensible defaults for all required properties', () => {
        const station = createChargingStation({
          connectorsCount: 1,
        })

        // Verify factory provides all required defaults
        expect(station.stationInfo?.chargingStationId).toBeDefined()
        expect(station.stationInfo?.hashId).toBeDefined()
        expect(station.stationInfo?.baseName).toBeDefined()
        expect(station.stationInfo?.ocppVersion).toBeDefined()
        expect(station.stationInfo?.templateHash).toBeUndefined() // Factory doesn't set templateHash by default
      })

      await it('Should allow overriding factory defaults', () => {
        const customStationId = 'custom-station-123'
        const customHashId = 'custom-hash-456'

        const station = createChargingStation({
          connectorsCount: 1,
          stationInfo: {
            chargingStationId: customStationId,
            hashId: customHashId,
          },
        })

        expect(station.stationInfo?.chargingStationId).toBe(customStationId)
        expect(station.stationInfo?.hashId).toBe(customHashId)
        // Other defaults should still be provided
        expect(station.stationInfo?.baseName).toBeDefined()
        expect(station.stationInfo?.ocppVersion).toBeDefined()
      })

      await it('Should use default base name when not provided', () => {
        const station = createChargingStation({
          connectorsCount: 1,
        })

        expect(station.stationInfo?.baseName).toBe('CS-TEST')
        expect(station.stationInfo?.chargingStationId).toBe('CS-TEST-00001')
      })

      await it('Should use custom base name when provided', () => {
        const customBaseName = 'CUSTOM-STATION'
        const station = createChargingStation({
          baseName: customBaseName,
          connectorsCount: 1,
        })

        expect(station.stationInfo?.baseName).toBe(customBaseName)
        expect(station.stationInfo?.chargingStationId).toBe('CUSTOM-STATION-00001')
      })
    })

    await describe('Configuration Options', async () => {
      await it('Should respect connection timeout setting', () => {
        const customTimeout = 45000
        const station = createChargingStation({
          connectionTimeout: customTimeout,
          connectorsCount: 1,
        })

        expect(station.getConnectionTimeout()).toBe(customTimeout)
      })

      await it('Should respect heartbeat interval setting', () => {
        const customInterval = 120000
        const station = createChargingStation({
          connectorsCount: 1,
          heartbeatInterval: customInterval,
        })

        expect(station.getHeartbeatInterval()).toBe(customInterval)
      })

      await it('Should respect websocket ping interval setting', () => {
        const customPingInterval = 90000
        const station = createChargingStation({
          connectorsCount: 1,
          websocketPingInterval: customPingInterval,
        })

        expect(station.getWebSocketPingInterval()).toBe(customPingInterval)
      })

      await it('Should respect started and starting flags', () => {
        const station = createChargingStation({
          connectorsCount: 1,
          started: true,
          starting: false,
        })

        expect(station.started).toBe(true)
        expect(station.starting).toBe(false)
      })
    })

    await describe('Integration with Helpers', async () => {
      await it('Should properly integrate with helper functions', () => {
        const station = createChargingStation({
          connectorsCount: 1,
          stationInfo: {
            baseName: 'HELPER-TEST',
            chargingStationId: 'HELPER-TEST-001',
          },
        })

        // Verify the station info is properly set
        expect(station.stationInfo?.chargingStationId).toBe('HELPER-TEST-001')

        // Verify hash ID generation works with the helpers
        const template = createChargingStationTemplate('HELPER-TEST')
        const hashId = getHashId(1, template)
        expect(hashId).toBeDefined()
        expect(typeof hashId).toBe('string')
      })
    })
  })

  await describe('Mock Behavioral Parity', async () => {
    await describe('getConnectorIdByTransactionId', async () => {
      await it('Should return undefined for null transaction ID', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Test null handling (matches real class behavior)
        expect(station.getConnectorIdByTransactionId(null)).toBeUndefined()
      })

      await it('Should return undefined for undefined transaction ID', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Test undefined handling (matches real class behavior)
        expect(station.getConnectorIdByTransactionId(undefined)).toBeUndefined()
      })

      await it('Should return connector ID when transaction ID matches (standard connectors)', () => {
        const station = createChargingStation({
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_16 }, // Force non-EVSE mode
        })

        // Set up a transaction on connector 1
        const connector1Status = station.getConnectorStatus(1)
        if (connector1Status) {
          connector1Status.transactionId = 'test-transaction-123'
        }

        expect(station.getConnectorIdByTransactionId('test-transaction-123')).toBe(1)
      })

      await it('Should return connector ID when transaction ID matches (EVSE mode)', () => {
        const station = createChargingStation({
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 }, // Force EVSE mode
        })

        // Set up a transaction on connector 1
        const connector1Status = station.getConnectorStatus(1)
        if (connector1Status) {
          connector1Status.transactionId = 'test-evse-transaction-456'
        }

        expect(station.getConnectorIdByTransactionId('test-evse-transaction-456')).toBe(1)
      })

      await it('Should return undefined when transaction ID does not match any connector', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        expect(station.getConnectorIdByTransactionId('non-existent-transaction')).toBeUndefined()
      })

      await it('Should handle numeric transaction IDs', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Set up a transaction with numeric ID on connector 2
        const connector2Status = station.getConnectorStatus(2)
        if (connector2Status) {
          connector2Status.transactionId = 12345
        }

        expect(station.getConnectorIdByTransactionId(12345)).toBe(2)
      })
    })

    await describe('getEvseIdByConnectorId', async () => {
      await it('Should return undefined for stations without EVSEs', () => {
        const station = createChargingStation({
          connectorsCount: 3,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_16 }, // OCPP 1.6 doesn't use EVSEs
        })

        expect(station.getEvseIdByConnectorId(1)).toBeUndefined()
        expect(station.getEvseIdByConnectorId(2)).toBeUndefined()
      })

      await it('Should return correct EVSE ID for connectors in EVSE mode', () => {
        const station = createChargingStation({
          connectorsCount: 6,
          evseConfiguration: { evsesCount: 2 }, // 2 EVSEs with 3 connectors each
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        })

        // EVSE 1 should have connectors 1, 2, 3
        expect(station.getEvseIdByConnectorId(1)).toBe(1)
        expect(station.getEvseIdByConnectorId(2)).toBe(1)
        expect(station.getEvseIdByConnectorId(3)).toBe(1)

        // EVSE 2 should have connectors 4, 5, 6
        expect(station.getEvseIdByConnectorId(4)).toBe(2)
        expect(station.getEvseIdByConnectorId(5)).toBe(2)
        expect(station.getEvseIdByConnectorId(6)).toBe(2)
      })

      await it('Should return undefined for non-existent connector IDs', () => {
        const station = createChargingStation({
          connectorsCount: 4,
          evseConfiguration: { evsesCount: 2 },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        })

        expect(station.getEvseIdByConnectorId(0)).toBeUndefined() // Connector 0 not in EVSEs
        expect(station.getEvseIdByConnectorId(99)).toBeUndefined() // Non-existent connector
        expect(station.getEvseIdByConnectorId(-1)).toBeUndefined() // Invalid connector ID
      })

      await it('Should handle single EVSE with multiple connectors', () => {
        const station = createChargingStation({
          connectorsCount: 3,
          evseConfiguration: { evsesCount: 1 }, // Single EVSE with all connectors
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        })

        // All connectors should belong to EVSE 1
        expect(station.getEvseIdByConnectorId(1)).toBe(1)
        expect(station.getEvseIdByConnectorId(2)).toBe(1)
        expect(station.getEvseIdByConnectorId(3)).toBe(1)
      })
    })

    await describe('isConnectorAvailable', async () => {
      await it('Should return false for connector ID 0', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Connector 0 should never be available (matches real class behavior)
        expect(station.isConnectorAvailable(0)).toBe(false)
      })

      await it('Should return false for negative connector ID', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Negative connectorId should return false (matches real class behavior)
        expect(station.isConnectorAvailable(-1)).toBe(false)
      })

      await it('Should return true for available operative connector', () => {
        const station = createChargingStation({
          connectorDefaults: {
            availability: AvailabilityType.Operative,
            status: ConnectorStatusEnum.Available,
          },
          connectorsCount: 2,
        })

        expect(station.isConnectorAvailable(1)).toBe(true)
        expect(station.isConnectorAvailable(2)).toBe(true)
      })

      await it('Should return false for inoperative connector', () => {
        const station = createChargingStation({
          connectorDefaults: {
            availability: AvailabilityType.Inoperative,
            status: ConnectorStatusEnum.Available,
          },
          connectorsCount: 2,
        })

        expect(station.isConnectorAvailable(1)).toBe(false)
        expect(station.isConnectorAvailable(2)).toBe(false)
      })

      await it('Should check availability regardless of status (matches real class)', () => {
        const station = createChargingStation({
          connectorDefaults: {
            availability: AvailabilityType.Operative,
            status: ConnectorStatusEnum.Occupied, // Status should not affect availability check
          },
          connectorsCount: 2,
        })

        // Real class only checks availability, not status
        expect(station.isConnectorAvailable(1)).toBe(true)
        expect(station.isConnectorAvailable(2)).toBe(true)
      })

      await it('Should return false for non-existent connector', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Connector 3 doesn't exist
        expect(station.isConnectorAvailable(3)).toBe(false)
      })

      await it('Should work correctly in EVSE mode', () => {
        const station = createChargingStation({
          connectorDefaults: {
            availability: AvailabilityType.Operative,
            status: ConnectorStatusEnum.Available,
          },
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 }, // Force EVSE mode
        })

        expect(station.isConnectorAvailable(1)).toBe(true)
        expect(station.isConnectorAvailable(2)).toBe(true)
      })
    })

    await describe('getConnectorStatus behavioral parity', async () => {
      await it('Should return undefined for non-existent connector in standard mode', () => {
        const station = createChargingStation({
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        })

        expect(station.getConnectorStatus(999)).toBeUndefined()
      })

      await it('Should return undefined for non-existent connector in EVSE mode', () => {
        const station = createChargingStation({
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        })

        expect(station.getConnectorStatus(999)).toBeUndefined()
      })

      await it('Should return connector status for valid connector in both modes', () => {
        const stationStandard = createChargingStation({
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        })
        const stationEVSE = createChargingStation({
          connectorsCount: 2,
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        })

        expect(stationStandard.getConnectorStatus(1)).toBeDefined()
        expect(stationEVSE.getConnectorStatus(1)).toBeDefined()
      })
    })

    await describe('Method interaction behavioral parity', async () => {
      await it('Should maintain consistency between getConnectorStatus and isConnectorAvailable', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Test consistency - if connector status exists and is operative, should be available
        const connector1Status = station.getConnectorStatus(1)
        expect(connector1Status).toBeDefined()
        expect(station.isConnectorAvailable(1)).toBe(true)

        // Make connector inoperative
        if (connector1Status) {
          connector1Status.availability = AvailabilityType.Inoperative
        }
        expect(station.isConnectorAvailable(1)).toBe(false)
      })

      await it('Should maintain consistency between getConnectorIdByTransactionId and getConnectorStatus', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Set up transaction
        const testTransactionId = 'test-consistency-transaction'
        const connector2Status = station.getConnectorStatus(2)
        if (connector2Status) {
          connector2Status.transactionId = testTransactionId
        }

        // Both methods should work with the same transaction
        const foundConnectorId = station.getConnectorIdByTransactionId(testTransactionId)
        expect(foundConnectorId).toBe(2)

        const foundConnectorStatus = station.getConnectorStatus(foundConnectorId)
        expect(foundConnectorStatus?.transactionId).toBe(testTransactionId)
      })
    })

    await describe('Edge Cases and Error Handling', async () => {
      await it('Should handle empty station (no connectors)', () => {
        const station = createChargingStation({ connectorsCount: 0 })

        expect(station.getConnectorIdByTransactionId('any-transaction')).toBeUndefined()
        expect(station.isConnectorAvailable(1)).toBe(false)
        expect(station.getConnectorStatus(1)).toBeUndefined()
      })

      await it('Should handle mixed transaction ID types in search', () => {
        const station = createChargingStation({ connectorsCount: 3 })

        // Set up mixed transaction types
        const connector1Status = station.getConnectorStatus(1)
        const connector2Status = station.getConnectorStatus(2)
        if (connector1Status && connector2Status) {
          connector1Status.transactionId = 'string-transaction'
          connector2Status.transactionId = 999
        }

        expect(station.getConnectorIdByTransactionId('string-transaction')).toBe(1)
        expect(station.getConnectorIdByTransactionId(999)).toBe(2)
        expect(station.getConnectorIdByTransactionId('999')).toBeUndefined() // String vs number
      })

      await it('Should handle partially configured connectors', () => {
        const station = createChargingStation({ connectorsCount: 2 })

        // Manually modify one connector to test resilience
        const connector1Status = station.getConnectorStatus(1)
        if (connector1Status) {
          connector1Status.availability = undefined // Remove availability property
        }

        // Should handle missing availability gracefully
        expect(station.isConnectorAvailable(1)).toBe(false)
        expect(station.isConnectorAvailable(2)).toBe(true) // Other connector still works
      })
    })
  })
})
