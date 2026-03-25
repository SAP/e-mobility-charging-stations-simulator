/**
 * @file Tests for CSConnector component
 * @description Unit tests for connector row display, transaction actions, and ATG controls.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UIClient } from '@/composables'

import CSConnector from '@/components/charging-stations/CSConnector.vue'
import { useUIClient } from '@/composables'
import { OCPP16ChargePointStatus } from '@/types'

import { toastMock } from '../setup'
import { createConnectorStatus, TEST_HASH_ID, TEST_STATION_ID } from './constants'
import { ButtonStub, createMockUIClient, type MockUIClient } from './helpers'

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return { ...(actual as Record<string, unknown>), useUIClient: vi.fn() }
})

/**
 * Mounts CSConnector with mock UIClient and Button stub.
 * @param overrideProps - Props to override defaults
 * @returns Mounted component wrapper
 */
function mountCSConnector (overrideProps: Record<string, unknown> = {}) {
  return mount(CSConnector, {
    global: {
      stubs: {
        Button: ButtonStub,
        ToggleButton: true,
      },
    },
    props: {
      chargingStationId: TEST_STATION_ID,
      connector: createConnectorStatus(),
      connectorId: 1,
      hashId: TEST_HASH_ID,
      ...overrideProps,
    },
  })
}

describe('CSConnector', () => {
  let mockClient: MockUIClient

  beforeEach(() => {
    mockClient = createMockUIClient()
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as UIClient)
  })

  describe('connector display', () => {
    it('should display connector ID without EVSE prefix', () => {
      const wrapper = mountCSConnector()
      const cells = wrapper.findAll('td')
      expect(cells[0].text()).toBe('1')
    })

    it('should display connector ID with EVSE prefix when evseId provided', () => {
      const wrapper = mountCSConnector({ evseId: 2 })
      const cells = wrapper.findAll('td')
      expect(cells[0].text()).toBe('2/1')
    })

    it('should display connector status', () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ status: OCPP16ChargePointStatus.CHARGING }),
      })
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('Charging')
    })

    it('should display Ø when connector status is undefined', () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ status: undefined }),
      })
      const cells = wrapper.findAll('td')
      expect(cells[1].text()).toBe('Ø')
    })

    it('should display No when transaction not started', () => {
      const wrapper = mountCSConnector()
      const cells = wrapper.findAll('td')
      expect(cells[2].text()).toBe('No')
    })

    it('should display Yes with transaction ID when transaction started', () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ transactionId: 12345, transactionStarted: true }),
      })
      const cells = wrapper.findAll('td')
      expect(cells[2].text()).toBe('Yes (12345)')
    })

    it('should display ATG started as Yes when active', () => {
      const wrapper = mountCSConnector({ atgStatus: { start: true } })
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('Yes')
    })

    it('should display ATG started as No when not active', () => {
      const wrapper = mountCSConnector({ atgStatus: { start: false } })
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('No')
    })

    it('should display ATG started as No when atgStatus undefined', () => {
      const wrapper = mountCSConnector()
      const cells = wrapper.findAll('td')
      expect(cells[3].text()).toBe('No')
    })
  })

  describe('transaction actions', () => {
    it('should call stopTransaction with correct params', async () => {
      const connector = createConnectorStatus({ transactionId: 12345, transactionStarted: true })
      const wrapper = mountCSConnector({ connector })
      const buttons = wrapper.findAll('button')
      const stopBtn = buttons.find(b => b.text() === 'Stop Transaction')
      await stopBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.stopTransaction).toHaveBeenCalledWith(TEST_HASH_ID, {
        ocppVersion: undefined,
        transactionId: 12345,
      })
    })

    it('should show error toast when no transaction to stop', async () => {
      const connector = createConnectorStatus({ transactionId: undefined })
      const wrapper = mountCSConnector({ connector })
      const buttons = wrapper.findAll('button')
      const stopBtn = buttons.find(b => b.text() === 'Stop Transaction')
      await stopBtn?.trigger('click')
      expect(toastMock.error).toHaveBeenCalledWith('No transaction to stop')
    })

    it('should show success toast after stopping transaction', async () => {
      const connector = createConnectorStatus({ transactionId: 99, transactionStarted: true })
      const wrapper = mountCSConnector({ connector })
      const buttons = wrapper.findAll('button')
      const stopBtn = buttons.find(b => b.text() === 'Stop Transaction')
      await stopBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Transaction successfully stopped')
    })
  })

  describe('ATG actions', () => {
    it('should call startAutomaticTransactionGenerator', async () => {
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const startAtgBtn = buttons.find(b => b.text() === 'Start ATG')
      await startAtgBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.startAutomaticTransactionGenerator).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('should call stopAutomaticTransactionGenerator', async () => {
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const stopAtgBtn = buttons.find(b => b.text() === 'Stop ATG')
      await stopAtgBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.stopAutomaticTransactionGenerator).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('should show error toast on ATG start failure', async () => {
      mockClient.startAutomaticTransactionGenerator.mockRejectedValueOnce(new Error('fail'))
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const startAtgBtn = buttons.find(b => b.text() === 'Start ATG')
      await startAtgBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith(
        'Error at starting automatic transaction generator'
      )
    })

    it('should show success toast when ATG started', async () => {
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().includes('Start ATG'))
      await btn?.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith(
        'Automatic transaction generator successfully started'
      )
    })

    it('should show error toast when ATG stop fails', async () => {
      mockClient.stopAutomaticTransactionGenerator.mockRejectedValueOnce(new Error('fail'))
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().includes('Stop ATG'))
      await btn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith(
        'Error at stopping automatic transaction generator'
      )
    })
  })

  describe('lock/unlock actions', () => {
    it('should display Locked column as No when not locked', () => {
      const wrapper = mountCSConnector()
      const cells = wrapper.findAll('td')
      expect(cells[4].text()).toBe('No')
    })

    it('should display Locked column as Yes when locked', () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ locked: true }),
      })
      const cells = wrapper.findAll('td')
      expect(cells[4].text()).toBe('Yes')
    })

    it('should show Lock button when connector is not locked', () => {
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const lockBtn = buttons.find(b => b.text() === 'Lock')
      expect(lockBtn).toBeDefined()
      expect(buttons.find(b => b.text() === 'Unlock')).toBeUndefined()
    })

    it('should show Unlock button when connector is locked', () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ locked: true }),
      })
      const buttons = wrapper.findAll('button')
      const unlockBtn = buttons.find(b => b.text() === 'Unlock')
      expect(unlockBtn).toBeDefined()
      expect(buttons.find(b => b.text() === 'Lock')).toBeUndefined()
    })

    it('should call lockConnector with correct params', async () => {
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const lockBtn = buttons.find(b => b.text() === 'Lock')
      await lockBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('should call unlockConnector with correct params', async () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ locked: true }),
      })
      const buttons = wrapper.findAll('button')
      const unlockBtn = buttons.find(b => b.text() === 'Unlock')
      await unlockBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.unlockConnector).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('should show success toast after locking connector', async () => {
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const lockBtn = buttons.find(b => b.text() === 'Lock')
      await lockBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connector successfully locked')
    })

    it('should show error toast on lock failure', async () => {
      mockClient.lockConnector.mockRejectedValueOnce(new Error('fail'))
      const wrapper = mountCSConnector()
      const buttons = wrapper.findAll('button')
      const lockBtn = buttons.find(b => b.text() === 'Lock')
      await lockBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at locking connector')
    })

    it('should show success toast after unlocking connector', async () => {
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ locked: true }),
      })
      const buttons = wrapper.findAll('button')
      const unlockBtn = buttons.find(b => b.text() === 'Unlock')
      await unlockBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.success).toHaveBeenCalledWith('Connector successfully unlocked')
    })

    it('should show error toast on unlock failure', async () => {
      mockClient.unlockConnector.mockRejectedValueOnce(new Error('fail'))
      const wrapper = mountCSConnector({
        connector: createConnectorStatus({ locked: true }),
      })
      const buttons = wrapper.findAll('button')
      const unlockBtn = buttons.find(b => b.text() === 'Unlock')
      await unlockBtn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalledWith('Error at unlocking connector')
    })
  })
})
