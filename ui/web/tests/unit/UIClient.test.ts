import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UIClient } from '@/composables/UIClient'
import {
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  Protocol,
  ProtocolVersion,
  ResponseStatus,
} from '@/types'

vi.mock('vue-toast-notification', () => ({
  useToast: () => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}))

class MockWebSocket {
  addEventListener = vi.fn()
  close = vi.fn()
  onclose: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  onopen: (() => void) | null = null

  readyState = WebSocket.OPEN
  removeEventListener = vi.fn()
  send = vi.fn()
  constructor () {
    setTimeout(() => {
      this.onopen?.()
    }, 0)
  }
}

const mockConfig = {
  host: 'localhost',
  port: 8080,
  protocol: Protocol.UI,
  version: ProtocolVersion['0.0.1'],
}

describe('UIClient', () => {
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

  describe('version-aware transaction methods', () => {
    let client: UIClient
    let sendRequestSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      // @ts-expect-error - accessing private static property for testing
      UIClient.instance = null
      vi.stubGlobal('WebSocket', MockWebSocket)
      client = UIClient.getInstance(mockConfig)
      // @ts-expect-error - accessing private method for testing
      sendRequestSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({
        status: ResponseStatus.SUCCESS,
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      // @ts-expect-error - accessing private static property for testing
      UIClient.instance = null
    })

    describe('startTransaction', () => {
      it('should send START_TRANSACTION for OCPP 1.6', async () => {
        await client.startTransaction('hash123', 1, 'idTag123', OCPPVersion.VERSION_16)

        expect(sendRequestSpy).toHaveBeenCalledWith('startTransaction', {
          connectorId: 1,
          hashIds: ['hash123'],
          idTag: 'idTag123',
        })
      })

      it('should send TRANSACTION_EVENT with evse object for OCPP 2.0.x', async () => {
        await client.startTransaction('hash123', 2, 'idTag123', OCPPVersion.VERSION_20, 1)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: { connectorId: 2, id: 1 },
          hashIds: ['hash123'],
          idToken: { idToken: 'idTag123', type: 'ISO14443' },
        })
      })

      it('should default to OCPP 1.6 when version is undefined', async () => {
        await client.startTransaction('hash123', 1, 'idTag123')

        expect(sendRequestSpy).toHaveBeenCalledWith('startTransaction', {
          connectorId: 1,
          hashIds: ['hash123'],
          idTag: 'idTag123',
        })
      })

      it('should send undefined evse when evseId is not provided for OCPP 2.0.x', async () => {
        await client.startTransaction('hash123', 1, 'idTag123', OCPPVersion.VERSION_20)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: undefined,
          hashIds: ['hash123'],
          idToken: { idToken: 'idTag123', type: 'ISO14443' },
        })
      })

      it('should send undefined idToken when idTag is not provided for OCPP 2.0.x', async () => {
        await client.startTransaction('hash123', 1, undefined, OCPPVersion.VERSION_20, 1)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: { connectorId: 1, id: 1 },
          hashIds: ['hash123'],
          idToken: undefined,
        })
      })

      it('should send undefined evse and idToken when both absent for OCPP 2.0.x', async () => {
        await client.startTransaction('hash123', 1, undefined, OCPPVersion.VERSION_20)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evse: undefined,
          hashIds: ['hash123'],
          idToken: undefined,
        })
      })
    })

    describe('stopTransaction', () => {
      it('should send STOP_TRANSACTION for OCPP 1.6', async () => {
        await client.stopTransaction('hash123', 12345, OCPPVersion.VERSION_16)

        expect(sendRequestSpy).toHaveBeenCalledWith('stopTransaction', {
          hashIds: ['hash123'],
          transactionId: 12345,
        })
      })

      it('should send TRANSACTION_EVENT with Ended for OCPP 2.0.x', async () => {
        await client.stopTransaction('hash123', 'tx-uuid-123', OCPPVersion.VERSION_20)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.ENDED,
          hashIds: ['hash123'],
          transactionId: 'tx-uuid-123',
        })
      })

      it('should default to OCPP 1.6 when version is undefined', async () => {
        await client.stopTransaction('hash123', 12345)

        expect(sendRequestSpy).toHaveBeenCalledWith('stopTransaction', {
          hashIds: ['hash123'],
          transactionId: 12345,
        })
      })

      it('should send undefined transactionId for OCPP 2.0.x when not provided', async () => {
        await client.stopTransaction('hash123', undefined, OCPPVersion.VERSION_20)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.ENDED,
          hashIds: ['hash123'],
          transactionId: undefined,
        })
      })

      it('should convert numeric transactionId to string for OCPP 2.0.x', async () => {
        await client.stopTransaction('hash123', 12345, OCPPVersion.VERSION_20)

        expect(sendRequestSpy).toHaveBeenCalledWith('transactionEvent', {
          eventType: OCPP20TransactionEventEnumType.ENDED,
          hashIds: ['hash123'],
          transactionId: '12345',
        })
      })

      it('should throw for string transactionId with OCPP 1.6', async () => {
        await expect(
          client.stopTransaction('hash123', 'string-id', OCPPVersion.VERSION_16)
        ).rejects.toThrow('OCPP 1.6 requires numeric transactionId')
      })

      it('should send undefined transactionId for OCPP 1.6 when not provided', async () => {
        await client.stopTransaction('hash123', undefined, OCPPVersion.VERSION_16)

        expect(sendRequestSpy).toHaveBeenCalledWith('stopTransaction', {
          hashIds: ['hash123'],
          transactionId: undefined,
        })
      })
    })
  })
})
