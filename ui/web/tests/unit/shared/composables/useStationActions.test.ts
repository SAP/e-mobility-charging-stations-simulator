/**
 * @file Tests for useStationActions composable
 * @description Verifies station-level actions (start/stop, connect/disconnect, delete) with pending
 *   state management, success/error toasts, and callback invocation.
 */
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toastMock } from '../../../setup.js'
import { createMockUIClient, type MockUIClient, withSetup } from '../../helpers.js'

let mockUIClient: MockUIClient

vi.mock('@/core/index.js', () => ({
  useUIClient: () => mockUIClient,
}))

import { useStationActions } from '@/shared/composables/useStationActions.js'

describe('useStationActions', () => {
  beforeEach(() => {
    mockUIClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('startStation', () => {
    it('should call startChargingStation with hashId', async () => {
      const [{ startStation }] = withSetup(() => useStationActions())
      startStation('hash-1')
      await flushPromises()
      expect(mockUIClient.startChargingStation).toHaveBeenCalledWith('hash-1')
    })

    it('should show success toast on success', async () => {
      const [{ startStation }] = withSetup(() => useStationActions())
      startStation('hash-1')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Charging station started')
    })

    it('should show error toast on failure', async () => {
      mockUIClient.startChargingStation.mockRejectedValueOnce(new Error('fail'))
      const [{ startStation }] = withSetup(() => useStationActions())
      startStation('hash-1')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error starting charging station')
    })

    it('should call onRefresh after success', async () => {
      const onRefresh = vi.fn()
      const [{ startStation }] = withSetup(() => useStationActions({ onRefresh }))
      startStation('hash-1')
      await flushPromises()
      expect(onRefresh).toHaveBeenCalledOnce()
    })
  })

  describe('stopStation', () => {
    it('should call stopChargingStation with hashId', async () => {
      const [{ stopStation }] = withSetup(() => useStationActions())
      stopStation('hash-2')
      await flushPromises()
      expect(mockUIClient.stopChargingStation).toHaveBeenCalledWith('hash-2')
    })

    it('should show success toast on success', async () => {
      const [{ stopStation }] = withSetup(() => useStationActions())
      stopStation('hash-2')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Charging station stopped')
    })

    it('should show error toast on failure', async () => {
      mockUIClient.stopChargingStation.mockRejectedValueOnce(new Error('fail'))
      const [{ stopStation }] = withSetup(() => useStationActions())
      stopStation('hash-2')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error stopping charging station')
    })
  })

  describe('openConnection', () => {
    it('should call openConnection with hashId', async () => {
      const [{ openConnection }] = withSetup(() => useStationActions())
      openConnection('hash-3')
      await flushPromises()
      expect(mockUIClient.openConnection).toHaveBeenCalledWith('hash-3')
    })

    it('should show success toast on success', async () => {
      const [{ openConnection }] = withSetup(() => useStationActions())
      openConnection('hash-3')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connection opened')
    })

    it('should show error toast on failure', async () => {
      mockUIClient.openConnection.mockRejectedValueOnce(new Error('fail'))
      const [{ openConnection }] = withSetup(() => useStationActions())
      openConnection('hash-3')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error opening connection')
    })
  })

  describe('closeConnection', () => {
    it('should call closeConnection with hashId', async () => {
      const [{ closeConnection }] = withSetup(() => useStationActions())
      closeConnection('hash-4')
      await flushPromises()
      expect(mockUIClient.closeConnection).toHaveBeenCalledWith('hash-4')
    })

    it('should show success toast on success', async () => {
      const [{ closeConnection }] = withSetup(() => useStationActions())
      closeConnection('hash-4')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connection closed')
    })

    it('should show error toast on failure', async () => {
      mockUIClient.closeConnection.mockRejectedValueOnce(new Error('fail'))
      const [{ closeConnection }] = withSetup(() => useStationActions())
      closeConnection('hash-4')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error closing connection')
    })
  })

  describe('deleteStation', () => {
    it('should call deleteChargingStation with hashId', async () => {
      const [{ deleteStation }] = withSetup(() => useStationActions())
      deleteStation('hash-5')
      await flushPromises()
      expect(mockUIClient.deleteChargingStation).toHaveBeenCalledWith('hash-5')
    })

    it('should show success toast on success', async () => {
      const [{ deleteStation }] = withSetup(() => useStationActions())
      deleteStation('hash-5')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Charging station deleted')
    })

    it('should show error toast on failure', async () => {
      mockUIClient.deleteChargingStation.mockRejectedValueOnce(new Error('fail'))
      const [{ deleteStation }] = withSetup(() => useStationActions())
      deleteStation('hash-5')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error deleting charging station')
    })

    it('should call onSuccess callback on success', async () => {
      const onSuccess = vi.fn()
      const [{ deleteStation }] = withSetup(() => useStationActions())
      deleteStation('hash-5', onSuccess)
      await flushPromises()
      expect(onSuccess).toHaveBeenCalledOnce()
    })

    it('should call onSuccess before onRefresh', async () => {
      const calls: string[] = []
      const onRefresh = vi.fn(() => calls.push('refresh'))
      const onSuccess = vi.fn(() => calls.push('success'))
      const [{ deleteStation }] = withSetup(() => useStationActions({ onRefresh }))
      deleteStation('hash-5', onSuccess)
      await flushPromises()
      expect(calls).toEqual(['success', 'refresh'])
    })
  })

  describe('pending state', () => {
    it('should initialize all pending keys to false', () => {
      const [{ pending }] = withSetup(() => useStationActions())
      expect(pending.startStop).toBe(false)
      expect(pending.connection).toBe(false)
      expect(pending.delete).toBe(false)
    })

    it('should set pending.startStop to true while action is in progress', async () => {
      let resolveAction!: (value: unknown) => void
      mockUIClient.startChargingStation.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ pending, startStation }] = withSetup(() => useStationActions())
      startStation('hash-1')
      expect(pending.startStop).toBe(true)
      resolveAction(undefined)
      await flushPromises()
      expect(pending.startStop).toBe(false)
    })

    it('should prevent concurrent startStop actions', async () => {
      let resolveAction!: (value: unknown) => void
      mockUIClient.startChargingStation.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ startStation, stopStation }] = withSetup(() => useStationActions())
      startStation('hash-1')
      stopStation('hash-2')
      resolveAction(undefined)
      await flushPromises()
      expect(mockUIClient.startChargingStation).toHaveBeenCalledOnce()
      expect(mockUIClient.stopChargingStation).not.toHaveBeenCalled()
      expect(toastMock.success).toHaveBeenCalledTimes(1)
      expect(toastMock.success).toHaveBeenCalledWith('Charging station started')
    })

    it('should prevent concurrent connection actions', async () => {
      let resolveAction!: (value: unknown) => void
      mockUIClient.openConnection.mockReturnValueOnce(
        new Promise(resolve => {
          resolveAction = resolve
        })
      )
      const [{ closeConnection, openConnection }] = withSetup(() => useStationActions())
      openConnection('hash-1')
      closeConnection('hash-2')
      resolveAction(undefined)
      await flushPromises()
      expect(mockUIClient.openConnection).toHaveBeenCalledOnce()
      expect(mockUIClient.closeConnection).not.toHaveBeenCalled()
    })

    it('should allow parallel actions on different keys', async () => {
      const [{ deleteStation, startStation }] = withSetup(() => useStationActions())
      startStation('hash-1')
      deleteStation('hash-2')
      await flushPromises()
      expect(mockUIClient.startChargingStation).toHaveBeenCalledWith('hash-1')
      expect(mockUIClient.deleteChargingStation).toHaveBeenCalledWith('hash-2')
    })
  })
})
