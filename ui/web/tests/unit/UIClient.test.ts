/**
 * @file Tests for UIClient composable
 * @description Unit tests for WebSocket client singleton, connection lifecycle,
 *   request/response handling, and all simulator/station operations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UIClient } from '@/composables/UIClient'
import {
  AuthenticationType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  ProcedureName,
  ResponseStatus,
} from '@/types'

import { createUIServerConfig, TEST_HASH_ID, TEST_ID_TAG } from './constants'
import { flushAllPromises, MockWebSocket } from './helpers'

// Reset singleton between tests
beforeEach(() => {
  // @ts-expect-error — accessing private static property for testing
  UIClient.instance = null
  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error — accessing private static property for testing
  UIClient.instance = null
})

describe('UIClient', () => {
  describe('singleton pattern', () => {
    it('should create instance when config is provided', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      expect(client).toBeInstanceOf(UIClient)
    })

    it('should throw when no config and no existing instance', () => {
      expect(() => UIClient.getInstance()).toThrow(
        'Cannot initialize UIClient if no configuration is provided'
      )
    })

    it('should return same instance on subsequent calls without config', () => {
      const first = UIClient.getInstance(createUIServerConfig())
      const second = UIClient.getInstance()
      expect(second).toBe(first)
    })
  })

  describe('isOCPP20x', () => {
    it('should return true for VERSION_20', () => {
      expect(UIClient.isOCPP20x(OCPPVersion.VERSION_20)).toBe(true)
    })

    it('should return true for VERSION_201', () => {
      expect(UIClient.isOCPP20x(OCPPVersion.VERSION_201)).toBe(true)
    })

    it('should return false for VERSION_16', () => {
      expect(UIClient.isOCPP20x(OCPPVersion.VERSION_16)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(UIClient.isOCPP20x(undefined)).toBe(false)
    })
  })

  describe('WebSocket connection', () => {
    it('should connect with ws:// URL format', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      expect(ws.url).toBe('ws://localhost:8080')
    })

    it('should connect with wss:// when secure is true', () => {
      const client = UIClient.getInstance(createUIServerConfig({ secure: true }))
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      expect(ws.url).toBe('wss://localhost:8080')
    })

    it('should use protocol version as subprotocol without auth', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      expect(ws.protocols).toBe('ui0.0.1')
    })

    it('should include basic auth credentials in subprotocol', () => {
      const config = createUIServerConfig({
        authentication: {
          enabled: true,
          password: 'pass',
          type: AuthenticationType.PROTOCOL_BASIC_AUTH,
          username: 'user',
        },
      })
      const client = UIClient.getInstance(config)
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      expect(ws.protocols).toBeInstanceOf(Array)
      const protocols = ws.protocols as string[]
      expect(protocols[0]).toBe('ui0.0.1')
      expect(protocols[1]).toMatch(/^authorization\.basic\./)
    })

    it('should handle WebSocket open event', async () => {
      UIClient.getInstance(createUIServerConfig())
      await flushAllPromises()
    })

    it('should log error on WebSocket error', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      ws.simulateError()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in WebSocket'),
        expect.any(Event)
      )
    })

    it('should handle WebSocket close event', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      ws.simulateClose()
    })
  })

  describe('request/response handling', () => {
    it('should resolve promise on SUCCESS response', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket

      const promise = client.listChargingStations()
      const [uuid] = JSON.parse(ws.sentMessages[0]) as [string]
      ws.simulateMessage([uuid, { status: ResponseStatus.SUCCESS }])

      const result = await promise
      expect(result.status).toBe(ResponseStatus.SUCCESS)
    })

    it('should reject promise on FAILURE response', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket

      const promise = client.listChargingStations()
      const [uuid] = JSON.parse(ws.sentMessages[0]) as [string]
      ws.simulateMessage([uuid, { status: ResponseStatus.FAILURE }])

      await expect(promise).rejects.toEqual(
        expect.objectContaining({ status: ResponseStatus.FAILURE })
      )
    })

    it('should reject with Error on unknown response status', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket

      const promise = client.listChargingStations()
      const [uuid] = JSON.parse(ws.sentMessages[0]) as [string]
      ws.simulateMessage([uuid, { status: 'unknown' }])

      await expect(promise).rejects.toThrow(/not supported/)
    })

    it('should reject when WebSocket is not open', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      ws.readyState = WebSocket.CLOSED

      await expect(client.listChargingStations()).rejects.toThrow('connection closed')
    })

    it('should reject when ws.send throws', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      ws.send.mockImplementation(() => {
        throw new Error('send failed')
      })

      await expect(client.startSimulator()).rejects.toThrow('error Error: send failed')
    })

    it('should handle invalid JSON response gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket

      ws.onmessage?.({ data: 'not json' } as MessageEvent<string>)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid response JSON format',
        expect.any(SyntaxError)
      )
    })

    it('should handle non-array response gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket

      ws.simulateMessage({ notAnArray: true })

      expect(consoleSpy).toHaveBeenCalledWith(
        'Response not an array:',
        expect.objectContaining({ notAnArray: true })
      )
    })

    it('should throw on response with unknown UUID', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket

      const fakeUUID = crypto.randomUUID()
      expect(() => {
        ws.simulateMessage([fakeUUID, { status: ResponseStatus.SUCCESS }])
      }).toThrow('Not a response to a request')
    })

    it('should reject on request timeout after 60 seconds', async () => {
      vi.useFakeTimers()
      try {
        const client = UIClient.getInstance(createUIServerConfig())
        const clearTimeoutSpy = vi
          .spyOn(globalThis, 'clearTimeout')
          .mockImplementation(() => undefined)
        const promise = client.listChargingStations()
        clearTimeoutSpy.mockRestore()
        vi.advanceTimersByTime(60_000)
        await expect(promise).rejects.toThrow('connection timeout')
      } finally {
        vi.useRealTimers()
      }
    })

    it('should handle response with invalid UUID', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      await flushAllPromises()
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      ws.simulateMessage(['not-a-valid-uuid', { status: ResponseStatus.SUCCESS }])
      // Should not throw — just logs error via toast
    })
  })

  describe('simulator operations', () => {
    let client: UIClient
    let sendRequestSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private method for testing
      sendRequestSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
    })

    it('should send START_SIMULATOR', async () => {
      await client.startSimulator()
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.START_SIMULATOR, {})
    })

    it('should send STOP_SIMULATOR', async () => {
      await client.stopSimulator()
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.STOP_SIMULATOR, {})
    })

    it('should send SIMULATOR_STATE', async () => {
      await client.simulatorState()
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.SIMULATOR_STATE, {})
    })
  })

  describe('charging station operations', () => {
    let client: UIClient
    let sendRequestSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private method for testing
      sendRequestSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
    })

    it('should send LIST_CHARGING_STATIONS', async () => {
      await client.listChargingStations()
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.LIST_CHARGING_STATIONS, {})
    })

    it('should send LIST_TEMPLATES', async () => {
      await client.listTemplates()
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.LIST_TEMPLATES, {})
    })

    it('should send START_CHARGING_STATION with hashIds', async () => {
      await client.startChargingStation(TEST_HASH_ID)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.START_CHARGING_STATION, {
        hashIds: [TEST_HASH_ID],
      })
    })

    it('should send STOP_CHARGING_STATION with hashIds', async () => {
      await client.stopChargingStation(TEST_HASH_ID)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.STOP_CHARGING_STATION, {
        hashIds: [TEST_HASH_ID],
      })
    })

    it('should send OPEN_CONNECTION with hashIds', async () => {
      await client.openConnection(TEST_HASH_ID)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.OPEN_CONNECTION, {
        hashIds: [TEST_HASH_ID],
      })
    })

    it('should send CLOSE_CONNECTION with hashIds', async () => {
      await client.closeConnection(TEST_HASH_ID)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.CLOSE_CONNECTION, {
        hashIds: [TEST_HASH_ID],
      })
    })

    it('should send DELETE_CHARGING_STATIONS with hashIds', async () => {
      await client.deleteChargingStation(TEST_HASH_ID)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.DELETE_CHARGING_STATIONS, {
        hashIds: [TEST_HASH_ID],
      })
    })

    it('should send SET_SUPERVISION_URL with hashIds and url', async () => {
      const url = 'ws://new-supervision:9001'
      await client.setSupervisionUrl(TEST_HASH_ID, url)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.SET_SUPERVISION_URL, {
        hashIds: [TEST_HASH_ID],
        url,
      })
    })

    it('should send AUTHORIZE with hashIds and idTag', async () => {
      await client.authorize(TEST_HASH_ID, TEST_ID_TAG)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.AUTHORIZE, {
        hashIds: [TEST_HASH_ID],
        idTag: TEST_ID_TAG,
      })
    })
  })

  describe('ATG operations', () => {
    let client: UIClient
    let sendRequestSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private method for testing
      sendRequestSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
    })

    it('should send START_AUTOMATIC_TRANSACTION_GENERATOR', async () => {
      await client.startAutomaticTransactionGenerator(TEST_HASH_ID, 1)
      expect(sendRequestSpy).toHaveBeenCalledWith(
        ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
        { connectorIds: [1], hashIds: [TEST_HASH_ID] }
      )
    })

    it('should send STOP_AUTOMATIC_TRANSACTION_GENERATOR', async () => {
      await client.stopAutomaticTransactionGenerator(TEST_HASH_ID, 2)
      expect(sendRequestSpy).toHaveBeenCalledWith(
        ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
        { connectorIds: [2], hashIds: [TEST_HASH_ID] }
      )
    })
  })

  describe('addChargingStations', () => {
    it('should send ADD_CHARGING_STATIONS with template, count, and options', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private method for testing
      const spy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
      const options = { autoStart: true }

      await client.addChargingStations('template.json', 3, options)

      expect(spy).toHaveBeenCalledWith(ProcedureName.ADD_CHARGING_STATIONS, {
        numberOfStations: 3,
        options,
        template: 'template.json',
      })
    })
  })

  describe('event listener management', () => {
    it('should register WebSocket event listener', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      const listener = vi.fn()

      client.registerWSEventListener('message', listener)

      expect(ws.addEventListener).toHaveBeenCalledWith('message', listener, undefined)
    })

    it('should unregister WebSocket event listener', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const ws = client.ws as MockWebSocket
      const listener = vi.fn()

      client.unregisterWSEventListener('message', listener)

      expect(ws.removeEventListener).toHaveBeenCalledWith('message', listener, undefined)
    })
  })

  describe('setConfiguration', () => {
    it('should close existing WebSocket and open new connection', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private property for testing
      const oldWs = client.ws as MockWebSocket

      client.setConfiguration(createUIServerConfig({ port: 9090 }))

      expect(oldWs.close).toHaveBeenCalled()
      // @ts-expect-error — accessing private property for testing
      const newWs = client.ws as MockWebSocket
      expect(newWs).not.toBe(oldWs)
      expect(newWs.url).toBe('ws://localhost:9090')
    })
  })

  describe('version-aware transaction methods', () => {
    let client: UIClient
    let sendRequestSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private method for testing
      sendRequestSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
    })

    describe('startTransaction', () => {
      it('should send START_TRANSACTION for OCPP 1.6', async () => {
        await client.startTransaction(TEST_HASH_ID, {
          connectorId: 1,
          idTag: TEST_ID_TAG,
          ocppVersion: OCPPVersion.VERSION_16,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.START_TRANSACTION, {
          connectorId: 1,
          hashIds: [TEST_HASH_ID],
          idTag: TEST_ID_TAG,
        })
      })

      it('should send TRANSACTION_EVENT with evse object for OCPP 2.0.x', async () => {
        await client.startTransaction(TEST_HASH_ID, {
          connectorId: 2,
          evseId: 1,
          idTag: TEST_ID_TAG,
          ocppVersion: OCPPVersion.VERSION_20,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: { connectorId: 2, id: 1 },
          hashIds: [TEST_HASH_ID],
          idToken: { idToken: TEST_ID_TAG, type: 'ISO14443' },
        })
      })

      it('should default to OCPP 1.6 when version is undefined', async () => {
        await client.startTransaction(TEST_HASH_ID, {
          connectorId: 1,
          idTag: TEST_ID_TAG,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.START_TRANSACTION, {
          connectorId: 1,
          hashIds: [TEST_HASH_ID],
          idTag: TEST_ID_TAG,
        })
      })

      it('should send undefined evse when evseId is not provided for OCPP 2.0.x', async () => {
        await client.startTransaction(TEST_HASH_ID, {
          connectorId: 1,
          idTag: TEST_ID_TAG,
          ocppVersion: OCPPVersion.VERSION_20,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: undefined,
          hashIds: [TEST_HASH_ID],
          idToken: { idToken: TEST_ID_TAG, type: 'ISO14443' },
        })
      })

      it('should send undefined idToken when idTag is not provided for OCPP 2.0.x', async () => {
        await client.startTransaction(TEST_HASH_ID, {
          connectorId: 1,
          evseId: 1,
          ocppVersion: OCPPVersion.VERSION_20,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: { connectorId: 1, id: 1 },
          hashIds: [TEST_HASH_ID],
          idToken: undefined,
        })
      })

      it('should send undefined evse and idToken when both absent for OCPP 2.0.x', async () => {
        await client.startTransaction(TEST_HASH_ID, {
          connectorId: 1,
          ocppVersion: OCPPVersion.VERSION_20,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: undefined,
          hashIds: [TEST_HASH_ID],
          idToken: undefined,
        })
      })
    })

    describe('stopTransaction', () => {
      it('should send STOP_TRANSACTION for OCPP 1.6', async () => {
        await client.stopTransaction(TEST_HASH_ID, {
          ocppVersion: OCPPVersion.VERSION_16,
          transactionId: 12345,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.STOP_TRANSACTION, {
          hashIds: [TEST_HASH_ID],
          transactionId: 12345,
        })
      })

      it('should send TRANSACTION_EVENT with Ended for OCPP 2.0.x', async () => {
        await client.stopTransaction(TEST_HASH_ID, {
          ocppVersion: OCPPVersion.VERSION_20,
          transactionId: 'tx-uuid-123',
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.ENDED,
          hashIds: [TEST_HASH_ID],
          transactionId: 'tx-uuid-123',
        })
      })

      it('should default to OCPP 1.6 when version is undefined', async () => {
        await client.stopTransaction(TEST_HASH_ID, { transactionId: 12345 })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.STOP_TRANSACTION, {
          hashIds: [TEST_HASH_ID],
          transactionId: 12345,
        })
      })

      it('should send undefined transactionId for OCPP 2.0.x when not provided', async () => {
        await client.stopTransaction(TEST_HASH_ID, {
          ocppVersion: OCPPVersion.VERSION_20,
          transactionId: undefined,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.ENDED,
          hashIds: [TEST_HASH_ID],
          transactionId: undefined,
        })
      })

      it('should convert numeric transactionId to string for OCPP 2.0.x', async () => {
        await client.stopTransaction(TEST_HASH_ID, {
          ocppVersion: OCPPVersion.VERSION_20,
          transactionId: 12345,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.TRANSACTION_EVENT, {
          eventType: OCPP20TransactionEventEnumType.ENDED,
          hashIds: [TEST_HASH_ID],
          transactionId: '12345',
        })
      })

      it('should return failure for string transactionId with OCPP 1.6', async () => {
        const result = await client.stopTransaction(TEST_HASH_ID, {
          ocppVersion: OCPPVersion.VERSION_16,
          transactionId: 'string-id',
        })

        expect(result.status).toBe(ResponseStatus.FAILURE)
        expect(sendRequestSpy).not.toHaveBeenCalled()
      })

      it('should send undefined transactionId for OCPP 1.6 when not provided', async () => {
        await client.stopTransaction(TEST_HASH_ID, {
          ocppVersion: OCPPVersion.VERSION_16,
          transactionId: undefined,
        })

        expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.STOP_TRANSACTION, {
          hashIds: [TEST_HASH_ID],
          transactionId: undefined,
        })
      })
    })
  })
})
