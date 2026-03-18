/**
 * @file Tests for CSConnector component
 * @description Unit tests for connector row display, transaction actions, and ATG controls.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UIClient } from '@/composables/UIClient'

import CSConnector from '@/components/charging-stations/CSConnector.vue'
import { useUIClient } from '@/composables'

import { createConnectorStatus, TEST_HASH_ID, TEST_STATION_ID } from './constants'
import { createMockUIClient, type MockUIClient } from './helpers'

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('vue-toast-notification', () => ({
  useToast: () => toastMock,
}))

vi.mock('@/composables', async importOriginal => {
  const actual = await importOriginal()
  return { ...(actual as Record<string, unknown>), useUIClient: vi.fn() }
})

const ButtonStub = {
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
}

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
        connector: createConnectorStatus({ status: 'Charging' as never }),
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
  })
})
