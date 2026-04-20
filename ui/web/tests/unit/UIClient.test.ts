/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * @file Tests for UIClient composable
 * @description Unit tests for WebSocket client singleton, connection lifecycle,
 *   request/response handling, and all simulator/station operations.
 */
import {
  AuthenticationType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  ProcedureName,
  ResponseStatus,
  ServerNotification,
} from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UIClient } from '@/composables'

import { toastMock } from '../setup'
import { createUIServerConfig, TEST_HASH_ID, TEST_ID_TAG } from './constants'
import { MockWebSocket } from './helpers'

// Reset singleton between tests
beforeEach(() => {
  MockWebSocket.lastInstance = null
  // @ts-expect-error — accessing private static property for testing
  UIClient.instance = null
  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  MockWebSocket.lastInstance = null
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
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      expect(ws.url).toBe('ws://localhost:8080')
    })

    it('should connect with wss:// when secure is true', () => {
      UIClient.getInstance(createUIServerConfig({ secure: true }))
      const ws = MockWebSocket.lastInstance!
      expect(ws.url).toBe('wss://localhost:8080')
    })

    it('should use protocol version as subprotocol without auth', () => {
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
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
      UIClient.getInstance(config)
      const ws = MockWebSocket.lastInstance!
      expect(ws.protocols).toBeInstanceOf(Array)
      const protocols = ws.protocols as string[]
      expect(protocols[0]).toBe('ui0.0.1')
      expect(protocols[1]).toMatch(/^authorization\.basic\./)
    })

    it('should show success toast on WebSocket open', () => {
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateOpen()
      expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining('successfully opened'))
    })

    it('should log error on WebSocket error', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateError()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in WebSocket'),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ error: expect.any(Error), message: expect.any(String) })
      )
    })

    it('should handle WebSocket close event', () => {
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateClose()
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('closed'))
    })
  })

  describe('request/response handling', () => {
    it('should resolve promise on SUCCESS response', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateOpen()

      const promise = client.listChargingStations()
      const uuid = (JSON.parse(ws.sentMessages[0]) as string[])[0]
      ws.simulateMessage([uuid, { status: ResponseStatus.SUCCESS }])

      const result = await promise
      expect(result.status).toBe(ResponseStatus.SUCCESS)
    })

    it('should reject promise on FAILURE response', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateOpen()

      const promise = client.listChargingStations()
      const uuid = (JSON.parse(ws.sentMessages[0]) as string[])[0]
      ws.simulateMessage([uuid, { status: ResponseStatus.FAILURE }])

      await expect(promise).rejects.toThrow(/failure status/)
    })

    it('should reject with Error on unknown response status', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateOpen()

      const promise = client.listChargingStations()
      const uuid = (JSON.parse(ws.sentMessages[0]) as string[])[0]
      ws.simulateMessage([uuid, { status: 'unknown' }])

      await expect(promise).rejects.toThrow(/failure status/)
    })

    it('should reject when WebSocket is not open', async () => {
      const client = UIClient.getInstance(createUIServerConfig())

      await expect(client.listChargingStations()).rejects.toThrow('WebSocket is not open')
    })

    it('should reject when ws.send throws', async () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateOpen()
      ws.send.mockImplementation(() => {
        throw new Error('send failed')
      })

      await expect(client.startSimulator()).rejects.toThrow('send failed')
    })

    it('should handle invalid JSON response gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!

      ws.onmessage?.({ data: 'not json' } as MessageEvent<string>)

      expect(toastMock.error).not.toHaveBeenCalled()
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('should handle non-array response gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!

      ws.simulateMessage({ notAnArray: true })

      expect(toastMock.error).not.toHaveBeenCalled()
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('should silently ignore response with unknown UUID', () => {
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!

      const fakeUUID = crypto.randomUUID()
      ws.simulateMessage([fakeUUID, { status: ResponseStatus.SUCCESS }])
      expect(toastMock.error).not.toHaveBeenCalled()
    })

    it('should silently ignore response with invalid UUID', () => {
      const consoleSpy = vi.spyOn(console, 'error')
      UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      ws.simulateMessage(['not-a-valid-uuid', { status: ResponseStatus.SUCCESS }])

      expect(toastMock.error).not.toHaveBeenCalled()
      expect(consoleSpy).not.toHaveBeenCalled()
    })
  })

  describe('server notifications', () => {
    it('should invoke refresh listeners on server notification', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const listener = vi.fn()
      client.onRefresh(listener)
      const ws = MockWebSocket.lastInstance!
      ws.simulateMessage([ServerNotification.REFRESH])
      expect(listener).toHaveBeenCalledOnce()
    })

    it('should not invoke refresh listeners after unsubscribe', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const listener = vi.fn()
      const unsubscribe = client.onRefresh(listener)
      unsubscribe()
      const ws = MockWebSocket.lastInstance!
      ws.simulateMessage([ServerNotification.REFRESH])
      expect(listener).not.toHaveBeenCalled()
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

    it('should send SET_SUPERVISION_URL with credentials when provided', async () => {
      const url = 'ws://new-supervision:9001'
      await client.setSupervisionUrl(TEST_HASH_ID, url, 'alice', 's3cret')
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.SET_SUPERVISION_URL, {
        hashIds: [TEST_HASH_ID],
        supervisionPassword: 's3cret',
        supervisionUser: 'alice',
        url,
      })
    })

    it('should send SET_SUPERVISION_URL with only credentials when url is omitted', async () => {
      await client.setSupervisionUrl(TEST_HASH_ID, undefined, 'alice', 's3cret')
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.SET_SUPERVISION_URL, {
        hashIds: [TEST_HASH_ID],
        supervisionPassword: 's3cret',
        supervisionUser: 'alice',
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
      const ws = MockWebSocket.lastInstance!
      const listener = vi.fn()

      client.registerWSEventListener('open', listener)
      ws.simulateOpen()

      expect(listener).toHaveBeenCalledOnce()
    })

    it('should unregister WebSocket event listener', () => {
      const client = UIClient.getInstance(createUIServerConfig())
      const ws = MockWebSocket.lastInstance!
      const listener = vi.fn()

      client.registerWSEventListener('open', listener)
      client.unregisterWSEventListener('open', listener)
      ws.simulateOpen()

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('setConfiguration', () => {
    let client: UIClient
    let oldWs: MockWebSocket

    beforeEach(() => {
      client = UIClient.getInstance(createUIServerConfig())
      oldWs = MockWebSocket.lastInstance!
      oldWs.simulateOpen()
    })

    it('should close existing WebSocket and open new connection', () => {
      client.setConfiguration(createUIServerConfig({ port: 9090 }))

      expect(oldWs.close).toHaveBeenCalled()
      const newWs = MockWebSocket.lastInstance!
      expect(newWs).not.toBe(oldWs)
    })

    it('should suppress close events from old connection', () => {
      client.setConfiguration(createUIServerConfig({ port: 9090 }))
      oldWs.simulateClose()
      expect(toastMock.info).not.toHaveBeenCalled()
    })

    it('should suppress error events from old connection', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      client.setConfiguration(createUIServerConfig({ port: 9090 }))
      oldWs.simulateError()
      expect(toastMock.error).not.toHaveBeenCalled()
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should suppress open events from old connection', () => {
      toastMock.success.mockClear()
      client.setConfiguration(createUIServerConfig({ port: 9090 }))
      oldWs.simulateOpen()
      expect(toastMock.success).not.toHaveBeenCalled()
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

  describe('connector lock operations', () => {
    let client: UIClient
    let sendRequestSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      client = UIClient.getInstance(createUIServerConfig())
      // @ts-expect-error — accessing private method for testing
      sendRequestSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
    })

    it('should send LOCK_CONNECTOR with hashIds and connectorId', async () => {
      await client.lockConnector(TEST_HASH_ID, 1)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.LOCK_CONNECTOR, {
        connectorId: 1,
        hashIds: [TEST_HASH_ID],
      })
    })

    it('should send UNLOCK_CONNECTOR with hashIds and connectorId', async () => {
      await client.unlockConnector(TEST_HASH_ID, 2)
      expect(sendRequestSpy).toHaveBeenCalledWith(ProcedureName.UNLOCK_CONNECTOR, {
        connectorId: 2,
        hashIds: [TEST_HASH_ID],
      })
    })
  })
})
