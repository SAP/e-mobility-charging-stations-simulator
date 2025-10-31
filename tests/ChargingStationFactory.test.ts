import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { getHashId } from '../src/charging-station/Helpers.js'
import { AvailabilityType, ConnectorStatusEnum, OCPPVersion } from '../src/types/index.js'
import { createChargingStation, createChargingStationTemplate } from './ChargingStationFactory.js'

await describe('ChargingStationFactory', async () => {
  await describe('OCPP Service Mocking', async () => {
    await it('Should throw explicit error when ocppRequestService is accessed without being mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppRequestService.requestHandler()
      ).rejects.toThrow(
        'ocppRequestService.requestHandler not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should throw explicit error when ocppIncomingRequestService is accessed without being mocked', () => {
      const station = createChargingStation({ connectorsCount: 1 })

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(station as any).ocppIncomingRequestService.stop()
      }).toThrow(
        'ocppIncomingRequestService.stop not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should allow custom ocppRequestService mock', async () => {
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

    await it('Should allow custom ocppIncomingRequestService mock', () => {
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

    await it('Should throw explicit error when ocppRequestService.sendError is accessed without being mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppRequestService.sendError()
      ).rejects.toThrow(
        'ocppRequestService.sendError not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should throw explicit error when ocppRequestService.sendResponse is accessed without being mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppRequestService.sendResponse()
      ).rejects.toThrow(
        'ocppRequestService.sendResponse not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should allow custom ocppRequestService.sendError mock', async () => {
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

    await it('Should allow custom ocppRequestService.sendResponse mock', async () => {
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

    await it('Should throw explicit error when ocppIncomingRequestService.incomingRequestHandler is accessed without being mocked', async () => {
      const station = createChargingStation({ connectorsCount: 1 })

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (station as any).ocppIncomingRequestService.incomingRequestHandler()
      ).rejects.toThrow(
        'ocppIncomingRequestService.incomingRequestHandler not mocked. Define in createChargingStation options.'
      )
    })

    await it('Should allow custom ocppIncomingRequestService.incomingRequestHandler mock', async () => {
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

      await it('Should validate stationInfo properties via Helpers', () => {
        // These tests are covered by the comprehensive validation tests
        // in Helpers.test.ts where properties are tested with undefined values
        const station = createChargingStation({
          connectorsCount: 1,
          stationInfo: {
            ocppVersion: OCPPVersion.VERSION_201,
          },
        })

        expect(station.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_201)
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
})
