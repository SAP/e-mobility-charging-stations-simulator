/**
 * @file Tests for useConnectorActions composable
 * @description Verifies connector-level actions (stop transaction, lock/unlock, ATG start/stop),
 *   pending state guards, toast notifications, and action dispatching.
 */
import { flushPromises } from '@vue/test-utils'
import { OCPP16ChargePointStatus, OCPP20ConnectorStatusEnumType, OCPPVersion } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toastMock } from '../../../setup.js'
import { createMockUIClient, type MockUIClient, withSetup } from '../../helpers.js'

let mockClient: MockUIClient

vi.mock('@/core/index.js', () => ({
  useUIClient: () => mockClient,
}))

import { useConnectorActions } from '@/shared/composables/useConnectorActions.js'

describe('useConnectorActions', () => {
  const hashId = 'test-hash-id'
  const connectorId = 1

  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('stopTransaction', () => {
    it('should show error toast when transactionId is null', () => {
      const [{ stopTransaction }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopTransaction(null)
      expect(toastMock.error).toHaveBeenCalledWith('No transaction to stop')
      expect(mockClient.stopTransaction).not.toHaveBeenCalled()
    })

    it('should show error toast when transactionId is undefined', () => {
      const [{ stopTransaction }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopTransaction(undefined)
      expect(toastMock.error).toHaveBeenCalledWith('No transaction to stop')
      expect(mockClient.stopTransaction).not.toHaveBeenCalled()
    })

    it('should call uiClient.stopTransaction with correct params', async () => {
      const [{ stopTransaction }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopTransaction(42)
      await flushPromises()
      expect(mockClient.stopTransaction).toHaveBeenCalledWith(hashId, {
        ocppVersion: undefined,
        transactionId: 42,
      })
    })

    it('should pass ocppVersion to stopTransaction', async () => {
      const [{ stopTransaction }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopTransaction('tx-uuid-123', OCPPVersion.VERSION_201)
      await flushPromises()
      expect(mockClient.stopTransaction).toHaveBeenCalledWith(hashId, {
        ocppVersion: OCPPVersion.VERSION_201,
        transactionId: 'tx-uuid-123',
      })
    })

    it('should show success toast on successful stop', async () => {
      const [{ stopTransaction }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopTransaction(1)
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Transaction stopped')
    })

    it('should show error toast on failure', async () => {
      mockClient.stopTransaction.mockRejectedValueOnce(new Error('fail'))
      const [{ stopTransaction }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopTransaction(1)
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error stopping transaction')
    })

    it('should set pending.stopTx while action is in progress', async () => {
      let resolveAction!: (value: unknown) => void
      mockClient.stopTransaction.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ pending, stopTransaction }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId })
      )
      stopTransaction(1)
      expect(pending.stopTx).toBe(true)
      resolveAction({ status: 'success' })
      await flushPromises()
      expect(pending.stopTx).toBe(false)
    })
  })

  describe('lockConnector', () => {
    it('should call uiClient.lockConnector with hashId and connectorId', async () => {
      const [{ lockConnector }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      lockConnector()
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalledWith(hashId, connectorId)
    })

    it('should show success toast on successful lock', async () => {
      const [{ lockConnector }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      lockConnector()
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connector locked')
    })

    it('should show error toast on failure', async () => {
      mockClient.lockConnector.mockRejectedValueOnce(new Error('fail'))
      const [{ lockConnector }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      lockConnector()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error locking connector')
    })

    it('should set pending.lock while action is in progress', async () => {
      let resolveAction!: (value: unknown) => void
      mockClient.lockConnector.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ lockConnector, pending }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId })
      )
      lockConnector()
      expect(pending.lock).toBe(true)
      resolveAction({ status: 'success' })
      await flushPromises()
      expect(pending.lock).toBe(false)
    })
  })

  describe('unlockConnector', () => {
    it('should call uiClient.unlockConnector with hashId and connectorId', async () => {
      const [{ unlockConnector }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      unlockConnector()
      await flushPromises()
      expect(mockClient.unlockConnector).toHaveBeenCalledWith(hashId, connectorId)
    })

    it('should show success toast on successful unlock', async () => {
      const [{ unlockConnector }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      unlockConnector()
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connector unlocked')
    })

    it('should show error toast on failure', async () => {
      mockClient.unlockConnector.mockRejectedValueOnce(new Error('fail'))
      const [{ unlockConnector }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      unlockConnector()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error unlocking connector')
    })

    it('should share pending.lock key with lockConnector', async () => {
      let resolveAction!: (value: unknown) => void
      mockClient.lockConnector.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ lockConnector, pending, unlockConnector }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId })
      )
      lockConnector()
      expect(pending.lock).toBe(true)
      // Second call on same key should be blocked
      unlockConnector()
      expect(mockClient.unlockConnector).not.toHaveBeenCalled()
      resolveAction({ status: 'success' })
      await flushPromises()
      expect(pending.lock).toBe(false)
    })
  })

  describe('startATG', () => {
    it('should call uiClient.startAutomaticTransactionGenerator with hashId and connectorId', async () => {
      const [{ startATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      startATG()
      await flushPromises()
      expect(mockClient.startAutomaticTransactionGenerator).toHaveBeenCalledWith(
        hashId,
        connectorId
      )
    })

    it('should show success toast on successful start', async () => {
      const [{ startATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      startATG()
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('ATG started')
    })

    it('should show error toast on failure', async () => {
      mockClient.startAutomaticTransactionGenerator.mockRejectedValueOnce(new Error('fail'))
      const [{ startATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      startATG()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error starting ATG')
    })

    it('should set pending.atg while action is in progress', async () => {
      let resolveAction!: (value: unknown) => void
      mockClient.startAutomaticTransactionGenerator.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ pending, startATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      startATG()
      expect(pending.atg).toBe(true)
      resolveAction({ status: 'success' })
      await flushPromises()
      expect(pending.atg).toBe(false)
    })
  })

  describe('stopATG', () => {
    it('should call uiClient.stopAutomaticTransactionGenerator with hashId and connectorId', async () => {
      const [{ stopATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopATG()
      await flushPromises()
      expect(mockClient.stopAutomaticTransactionGenerator).toHaveBeenCalledWith(hashId, connectorId)
    })

    it('should show success toast on successful stop', async () => {
      const [{ stopATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopATG()
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('ATG stopped')
    })

    it('should show error toast on failure', async () => {
      mockClient.stopAutomaticTransactionGenerator.mockRejectedValueOnce(new Error('fail'))
      const [{ stopATG }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      stopATG()
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error stopping ATG')
    })

    it('should share pending.atg key with startATG', async () => {
      let resolveAction!: (value: unknown) => void
      mockClient.startAutomaticTransactionGenerator.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ pending, startATG, stopATG }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId })
      )
      startATG()
      expect(pending.atg).toBe(true)
      // Second call on same key should be blocked
      stopATG()
      expect(mockClient.stopAutomaticTransactionGenerator).not.toHaveBeenCalled()
      resolveAction({ status: 'success' })
      await flushPromises()
      expect(pending.atg).toBe(false)
    })
  })

  describe('setConnectorStatus', () => {
    it('should call uiClient.setConnectorStatus with hashId, connectorId, and status', async () => {
      const [{ setConnectorStatus }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      setConnectorStatus(OCPP16ChargePointStatus.FAULTED)
      await flushPromises()
      expect(mockClient.setConnectorStatus).toHaveBeenCalledWith(
        hashId,
        connectorId,
        OCPP16ChargePointStatus.FAULTED,
        undefined,
        undefined,
        undefined
      )
    })

    it('should pass evseId when provided', async () => {
      const evseId = 2
      const [{ setConnectorStatus }] = withSetup(() =>
        useConnectorActions({ connectorId, evseId, hashId })
      )
      setConnectorStatus(OCPP16ChargePointStatus.AVAILABLE)
      await flushPromises()
      expect(mockClient.setConnectorStatus).toHaveBeenCalledWith(
        hashId,
        connectorId,
        OCPP16ChargePointStatus.AVAILABLE,
        evseId,
        undefined,
        undefined
      )
    })

    it('should show success toast on successful status update', async () => {
      const [{ setConnectorStatus }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      setConnectorStatus(OCPP16ChargePointStatus.UNAVAILABLE)
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connector status updated')
    })

    it('should show error toast on failure', async () => {
      mockClient.setConnectorStatus.mockRejectedValueOnce(new Error('fail'))
      const [{ setConnectorStatus }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      setConnectorStatus(OCPP16ChargePointStatus.FAULTED)
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error setting connector status')
    })

    it('should set pending.setStatus while action is in progress', async () => {
      let resolveAction!: (value: unknown) => void
      mockClient.setConnectorStatus.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ pending, setConnectorStatus }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId })
      )
      setConnectorStatus(OCPP16ChargePointStatus.FAULTED)
      expect(pending.setStatus).toBe(true)
      resolveAction({ status: 'success' })
      await flushPromises()
      expect(pending.setStatus).toBe(false)
    })

    it('should pass ocppVersion when provided', async () => {
      const [{ setConnectorStatus }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId, ocppVersion: OCPPVersion.VERSION_201 })
      )
      setConnectorStatus(OCPP20ConnectorStatusEnumType.AVAILABLE)
      await flushPromises()
      expect(mockClient.setConnectorStatus).toHaveBeenCalledWith(
        hashId,
        connectorId,
        OCPP20ConnectorStatusEnumType.AVAILABLE,
        undefined,
        OCPPVersion.VERSION_201,
        undefined
      )
    })

    it('should invoke onSuccess callback after successful status update', async () => {
      const onSuccess = vi.fn()
      const [{ setConnectorStatus }] = withSetup(() => useConnectorActions({ connectorId, hashId }))
      setConnectorStatus(OCPP16ChargePointStatus.AVAILABLE, onSuccess)
      await flushPromises()
      expect(onSuccess).toHaveBeenCalledOnce()
    })
  })

  describe('Ref-based deps', () => {
    it('should resolve Ref<string> hashId', async () => {
      const { ref } = await import('vue')
      const hashIdRef = ref('ref-hash-id')
      const [{ lockConnector }] = withSetup(() =>
        useConnectorActions({ connectorId, hashId: hashIdRef })
      )
      lockConnector()
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalledWith('ref-hash-id', connectorId)
    })

    it('should resolve Ref<number> connectorId', async () => {
      const { ref } = await import('vue')
      const connectorIdRef = ref(3)
      const [{ lockConnector }] = withSetup(() =>
        useConnectorActions({ connectorId: connectorIdRef, hashId })
      )
      lockConnector()
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalledWith(hashId, 3)
    })
  })
})
