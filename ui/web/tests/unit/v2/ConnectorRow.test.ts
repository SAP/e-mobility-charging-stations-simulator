/**
 * @file Tests for v2 ConnectorRow
 * @description Status/lock/ATG pills, primary/stop actions, router navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import {
  OCPP16AvailabilityType,
  OCPP16ChargePointStatus,
  OCPPVersion,
  type Status,
} from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uiClientKey } from '@/composables'
import ConnectorRow from '@/v2/components/ConnectorRow.vue'

import { toastMock } from '../../setup'
import { TEST_HASH_ID, TEST_STATION_ID } from '../constants'
import { createMockUIClient, type MockUIClient } from '../helpers'

vi.mock('vue-router', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, useRouter: vi.fn() }
})

import { useRouter } from 'vue-router'

let mockClient: MockUIClient
let mockRouter: { push: ReturnType<typeof vi.fn> }

beforeEach(() => {
  mockClient = createMockUIClient()
  mockRouter = { push: vi.fn().mockResolvedValue(undefined) }
  vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
})

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * Mounts a ConnectorRow with sensible defaults; pass partial overrides.
 * @param props partial props
 * @returns mounted wrapper
 */
function mountRow (
  props: Partial<{
    atgStatus: Status | undefined
    connector: Record<string, unknown>
    connectorId: number
    evseId: number | undefined
    ocppVersion: OCPPVersion | undefined
  }> = {}
) {
  const connector = {
    availability: OCPP16AvailabilityType.OPERATIVE,
    status: OCPP16ChargePointStatus.AVAILABLE,
    ...props.connector,
  }
  return mount(ConnectorRow, {
    global: {
      provide: { [uiClientKey as symbol]: mockClient },
    },
    props: {
      atgStatus: props.atgStatus,
      chargingStationId: TEST_STATION_ID,
      connector,
      connectorId: props.connectorId ?? 1,
      evseId: props.evseId,
      hashId: TEST_HASH_ID,
      ocppVersion: props.ocppVersion,
    },
  })
}

describe('v2 ConnectorRow', () => {
  describe('identifier display', () => {
    it('shows the bare connector id when no evseId', () => {
      const wrapper = mountRow()
      expect(wrapper.find('.v2-connector__id').text()).toBe('1')
    })

    it('shows evseId/connectorId format when evseId is set', () => {
      const wrapper = mountRow({ connectorId: 3, evseId: 2 })
      expect(wrapper.find('.v2-connector__id').text()).toBe('2/3')
    })
  })

  describe('status pill variants', () => {
    it.each<[string, string]>([
      ['Available', 'v2-pill--ok'],
      ['Charging', 'v2-pill--warn'],
      ['Occupied', 'v2-pill--warn'],
      ['Preparing', 'v2-pill--warn'],
      ['Faulted', 'v2-pill--err'],
      ['Unavailable', 'v2-pill--err'],
      ['Reserved', 'v2-pill--idle'],
    ])('maps status "%s" to class %s', (status, cls) => {
      const wrapper = mountRow({ connector: { status } })
      const pills = wrapper.findAll('.v2-pill')
      expect(pills[0].classes()).toContain(cls)
    })

    it('renders "unknown" label when status is undefined', () => {
      const wrapper = mountRow({ connector: { status: undefined } })
      expect(wrapper.text()).toContain('unknown')
    })
  })

  describe('lock button', () => {
    it('shows closed padlock when effectively locked (locked=true)', () => {
      const wrapper = mountRow({ connector: { locked: true } })
      expect(wrapper.find('.v2-connector__lock--on').exists()).toBe(true)
    })

    it('shows closed padlock when transaction started (even without explicit lock)', () => {
      const wrapper = mountRow({ connector: { transactionStarted: true } })
      expect(wrapper.find('.v2-connector__lock--on').exists()).toBe(true)
    })

    it('is disabled during transaction', () => {
      const wrapper = mountRow({ connector: { transactionStarted: true } })
      const btn = wrapper.find('.v2-connector__lock').element as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })

    it('calls lockConnector when unlocked', async () => {
      const wrapper = mountRow()
      await wrapper.find('.v2-connector__lock').trigger('click')
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalledWith(TEST_HASH_ID, 1)
      expect(toastMock.success).toHaveBeenCalled()
      expect(wrapper.emitted('need-refresh')).toBeTruthy()
    })

    it('calls unlockConnector when locked', async () => {
      const wrapper = mountRow({ connector: { locked: true } })
      await wrapper.find('.v2-connector__lock').trigger('click')
      await flushPromises()
      expect(mockClient.unlockConnector).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('toasts error when lock call fails', async () => {
      const wrapper = mountRow()
      mockClient.lockConnector = vi.fn().mockRejectedValue(new Error('fail'))
      await wrapper.find('.v2-connector__lock').trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
    })
  })

  describe('ATG chip', () => {
    it('labels "Start ATG" when not running', () => {
      const wrapper = mountRow({ atgStatus: undefined })
      expect(wrapper.text()).toContain('Start ATG')
    })

    it('labels "Stop ATG" when running', () => {
      const wrapper = mountRow({ atgStatus: { start: true } as Status })
      expect(wrapper.text()).toContain('Stop ATG')
    })

    it('calls startAutomaticTransactionGenerator when starting', async () => {
      const wrapper = mountRow()
      const chip = wrapper.find('.v2-btn--chip')
      await chip.trigger('click')
      await flushPromises()
      expect(mockClient.startAutomaticTransactionGenerator).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('calls stopAutomaticTransactionGenerator when stopping', async () => {
      const wrapper = mountRow({ atgStatus: { start: true } as Status })
      const chip = wrapper.find('.v2-btn--chip')
      await chip.trigger('click')
      await flushPromises()
      expect(mockClient.stopAutomaticTransactionGenerator).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })
  })

  describe('transaction controls', () => {
    it('shows play icon when no transaction and navigates on click', async () => {
      const wrapper = mountRow({ connectorId: 2, evseId: 3, ocppVersion: OCPPVersion.VERSION_16 })
      const startBtn = wrapper.find('.v2-icon-btn--primary')
      expect(startBtn.exists()).toBe(true)
      await startBtn.trigger('click')
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'v2-start-transaction',
          params: { chargingStationId: TEST_STATION_ID, connectorId: '2', hashId: TEST_HASH_ID },
          query: { evseId: '3', ocppVersion: OCPPVersion.VERSION_16 },
        })
      )
    })

    it('omits evseId/ocppVersion from query when not set', async () => {
      const wrapper = mountRow()
      await wrapper.find('.v2-icon-btn--primary').trigger('click')
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({ query: {} })
      )
    })

    it('shows stop icon when transaction running and stops it', async () => {
      const wrapper = mountRow({
        connector: { status: OCPP16ChargePointStatus.CHARGING, transactionId: 99, transactionStarted: true },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      const stopBtn = wrapper.find('.v2-icon-btn--danger')
      expect(stopBtn.exists()).toBe(true)
      await stopBtn.trigger('click')
      await flushPromises()
      expect(mockClient.stopTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({ ocppVersion: OCPPVersion.VERSION_16, transactionId: 99 })
      )
    })

    it('toasts error when stop is clicked without a transactionId', async () => {
      const wrapper = mountRow({
        connector: { status: OCPP16ChargePointStatus.CHARGING, transactionStarted: true },
      })
      const stopBtn = wrapper.find('.v2-icon-btn--danger')
      await stopBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.stopTransaction).not.toHaveBeenCalled()
    })
  })

  describe('transaction details rendering', () => {
    it('renders energy in kWh when ≥ 1000 Wh', () => {
      const wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionEnergyActiveImportRegisterValue: 1500,
          transactionId: 7,
          transactionStarted: true,
        },
      })
      expect(wrapper.text()).toContain('1.50 kWh')
    })

    it('renders energy in Wh when < 1000', () => {
      const wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionEnergyActiveImportRegisterValue: 120,
          transactionId: 7,
          transactionStarted: true,
        },
      })
      expect(wrapper.text()).toContain('120 Wh')
    })

    it('renders "—" when energy value is missing', () => {
      const wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionId: 7,
          transactionStarted: true,
        },
      })
      expect(wrapper.find('.v2-connector__tx-table').text()).toContain('—')
    })

    it('renders Tag row when transactionIdTag is set', () => {
      const wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionId: 7,
          transactionIdTag: 'RFID-TAG-001',
          transactionStarted: true,
        },
      })
      expect(wrapper.text()).toContain('RFID-TAG-001')
    })
  })
})
