import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  Protocol,
  ProtocolVersion,
  ResponseStatus,
} from '@/types'

import { UIClient } from '../UIClient'

// Mock the toast notification
vi.mock('vue-toast-notification', () => ({
  useToast: () => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}))

// Mock WebSocket constructor
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
    // Simulate async connection
    setTimeout(() => {
      this.onopen?.()
    }, 0)
  }
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

  describe('startTransactionForVersion', () => {
    let client: UIClient
    let startTransactionSpy: ReturnType<typeof vi.spyOn>
    let transactionEventSpy: ReturnType<typeof vi.spyOn>

    const mockConfig = {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    }

    beforeEach(() => {
      // Reset the singleton instance
      // @ts-expect-error - accessing private static property for testing
      UIClient.instance = null

      // Mock WebSocket
      vi.stubGlobal('WebSocket', MockWebSocket)

      client = UIClient.getInstance(mockConfig)
      startTransactionSpy = vi
        .spyOn(client, 'startTransaction')
        .mockResolvedValue({ status: ResponseStatus.SUCCESS })
      transactionEventSpy = vi
        .spyOn(client, 'transactionEvent')
        .mockResolvedValue({ status: ResponseStatus.SUCCESS })
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      // @ts-expect-error - accessing private static property for testing
      UIClient.instance = null
    })

    it('should call startTransaction for OCPP 1.6', async () => {
      await client.startTransactionForVersion('hash123', 1, 'idTag123', OCPPVersion.VERSION_16)

      expect(startTransactionSpy).toHaveBeenCalledWith('hash123', 1, 'idTag123')
      expect(transactionEventSpy).not.toHaveBeenCalled()
    })

    it('should call transactionEvent for OCPP 2.0', async () => {
      await client.startTransactionForVersion('hash123', 1, 'idTag123', OCPPVersion.VERSION_20)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.STARTED,
        evseId: 1,
        idToken: { idToken: 'idTag123', type: 'ISO14443' },
      })
      expect(startTransactionSpy).not.toHaveBeenCalled()
    })

    it('should call transactionEvent for OCPP 2.0.1', async () => {
      await client.startTransactionForVersion('hash123', 1, 'idTag123', OCPPVersion.VERSION_201)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.STARTED,
        evseId: 1,
        idToken: { idToken: 'idTag123', type: 'ISO14443' },
      })
      expect(startTransactionSpy).not.toHaveBeenCalled()
    })

    it('should call startTransaction when version is undefined', async () => {
      await client.startTransactionForVersion('hash123', 1, 'idTag123', undefined)

      expect(startTransactionSpy).toHaveBeenCalledWith('hash123', 1, 'idTag123')
      expect(transactionEventSpy).not.toHaveBeenCalled()
    })

    it('should handle undefined idTag for OCPP 2.0', async () => {
      await client.startTransactionForVersion('hash123', 1, undefined, OCPPVersion.VERSION_20)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.STARTED,
        evseId: 1,
        idToken: undefined,
      })
    })
  })

  describe('stopTransactionForVersion', () => {
    let client: UIClient
    let stopTransactionSpy: ReturnType<typeof vi.spyOn>
    let transactionEventSpy: ReturnType<typeof vi.spyOn>

    const mockConfig = {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    }

    beforeEach(() => {
      // Reset the singleton instance
      // @ts-expect-error - accessing private static property for testing
      UIClient.instance = null

      // Mock WebSocket
      vi.stubGlobal('WebSocket', MockWebSocket)

      client = UIClient.getInstance(mockConfig)
      stopTransactionSpy = vi
        .spyOn(client, 'stopTransaction')
        .mockResolvedValue({ status: ResponseStatus.SUCCESS })
      transactionEventSpy = vi
        .spyOn(client, 'transactionEvent')
        .mockResolvedValue({ status: ResponseStatus.SUCCESS })
    })

    afterEach(() => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      // @ts-expect-error - accessing private static property for testing
      UIClient.instance = null
    })

    it('should call stopTransaction for OCPP 1.6', async () => {
      await client.stopTransactionForVersion('hash123', 12345, OCPPVersion.VERSION_16)

      expect(stopTransactionSpy).toHaveBeenCalledWith('hash123', 12345)
      expect(transactionEventSpy).not.toHaveBeenCalled()
    })

    it('should call transactionEvent for OCPP 2.0', async () => {
      await client.stopTransactionForVersion('hash123', 'tx-uuid-123', OCPPVersion.VERSION_20)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.ENDED,
        transactionId: 'tx-uuid-123',
      })
      expect(stopTransactionSpy).not.toHaveBeenCalled()
    })

    it('should call transactionEvent for OCPP 2.0.1', async () => {
      await client.stopTransactionForVersion('hash123', 'tx-uuid-456', OCPPVersion.VERSION_201)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.ENDED,
        transactionId: 'tx-uuid-456',
      })
      expect(stopTransactionSpy).not.toHaveBeenCalled()
    })

    it('should call stopTransaction when version is undefined', async () => {
      await client.stopTransactionForVersion('hash123', 12345, undefined)

      expect(stopTransactionSpy).toHaveBeenCalledWith('hash123', 12345)
      expect(transactionEventSpy).not.toHaveBeenCalled()
    })

    it('should handle undefined transactionId for OCPP 2.0', async () => {
      await client.stopTransactionForVersion('hash123', undefined, OCPPVersion.VERSION_20)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.ENDED,
        transactionId: undefined,
      })
    })

    it('should convert numeric transactionId to string for OCPP 2.0', async () => {
      await client.stopTransactionForVersion('hash123', 12345, OCPPVersion.VERSION_20)

      expect(transactionEventSpy).toHaveBeenCalledWith('hash123', {
        eventType: OCPP20TransactionEventEnumType.ENDED,
        transactionId: '12345',
      })
    })
  })
})
