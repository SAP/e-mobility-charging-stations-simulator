/**
 * @file Tests for modern ConnectorRow
 * @description Status/lock/ATG pills, primary/stop actions, event emission.
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
import ConnectorRow from '@/skins/modern/components/ConnectorRow.vue'

import { toastMock } from '../../../setup'
import { TEST_HASH_ID, TEST_STATION_ID } from '../../constants'
import { createMockUIClient, type MockUIClient } from '../../helpers'

let mockClient: MockUIClient
let wrapper: ReturnType<typeof mountRow> | undefined

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

describe('modern ConnectorRow', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  describe('identifier display', () => {
    it('should show the bare connector id when no evseId', () => {
      wrapper = mountRow()
      expect(wrapper.find('.modern-connector__id').text()).toBe('1')
    })

    it('should show evseId/connectorId format when evseId is set', () => {
      wrapper = mountRow({ connectorId: 3, evseId: 2 })
      expect(wrapper.find('.modern-connector__id').text()).toBe('2/3')
    })
  })

  describe('status pill variants', () => {
    it.each<[string, string]>([
      ['Available', 'modern-pill--ok'],
      ['Charging', 'modern-pill--ok'],
      ['Occupied', 'modern-pill--ok'],
      ['Preparing', 'modern-pill--warn'],
      ['Faulted', 'modern-pill--err'],
      ['Unavailable', 'modern-pill--err'],
      ['Reserved', 'modern-pill--idle'],
    ])('should map status "%s" to class %s', (status, cls) => {
      wrapper = mountRow({ connector: { status } })
      const pills = wrapper.findAll('.modern-pill')
      expect(pills[0].classes()).toContain(cls)
    })

    it('should render "unknown" label when status is undefined', () => {
      wrapper = mountRow({ connector: { status: undefined } })
      expect(wrapper.text()).toContain('unknown')
    })
  })

  describe('lock button', () => {
    it('should show closed padlock when effectively locked (locked=true)', () => {
      wrapper = mountRow({ connector: { locked: true } })
      expect(wrapper.find('.modern-connector__lock--on').exists()).toBe(true)
    })

    it('should show closed padlock when transaction started (even without explicit lock)', () => {
      wrapper = mountRow({ connector: { transactionStarted: true } })
      expect(wrapper.find('.modern-connector__lock--on').exists()).toBe(true)
    })

    it('should be disabled during transaction', () => {
      wrapper = mountRow({ connector: { transactionStarted: true } })
      const btn = wrapper.find('.modern-connector__lock').element as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })

    it('should call lockConnector when unlocked', async () => {
      wrapper = mountRow()
      await wrapper.find('.modern-connector__lock').trigger('click')
      await flushPromises()
      expect(mockClient.lockConnector).toHaveBeenCalledWith(TEST_HASH_ID, 1)
      expect(toastMock.success).toHaveBeenCalled()
      expect(wrapper.emitted('need-refresh')).toBeTruthy()
    })

    it('should call unlockConnector when locked', async () => {
      wrapper = mountRow({ connector: { locked: true } })
      await wrapper.find('.modern-connector__lock').trigger('click')
      await flushPromises()
      expect(mockClient.unlockConnector).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('should toast error when lock call fails', async () => {
      wrapper = mountRow()
      mockClient.lockConnector = vi.fn().mockRejectedValue(new Error('fail'))
      await wrapper.find('.modern-connector__lock').trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
    })
  })

  describe('ATG chip', () => {
    it('should label "Start ATG" when not running', () => {
      wrapper = mountRow({ atgStatus: undefined })
      expect(wrapper.text()).toContain('Start ATG')
    })

    it('should label "Stop ATG" when running', () => {
      wrapper = mountRow({ atgStatus: { start: true } as Status })
      expect(wrapper.text()).toContain('Stop ATG')
    })

    it('should call startAutomaticTransactionGenerator when starting', async () => {
      wrapper = mountRow()
      const chip = wrapper.find('.modern-btn--chip')
      await chip.trigger('click')
      await flushPromises()
      expect(mockClient.startAutomaticTransactionGenerator).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })

    it('should call stopAutomaticTransactionGenerator when stopping', async () => {
      wrapper = mountRow({ atgStatus: { start: true } as Status })
      const chip = wrapper.find('.modern-btn--chip')
      await chip.trigger('click')
      await flushPromises()
      expect(mockClient.stopAutomaticTransactionGenerator).toHaveBeenCalledWith(TEST_HASH_ID, 1)
    })
  })

  describe('transaction controls', () => {
    it('should show play icon when no transaction and emits open-start-tx on click', async () => {
      wrapper = mountRow({ connectorId: 2, evseId: 3, ocppVersion: OCPPVersion.VERSION_16 })
      const startBtn = wrapper.find('.modern-icon-btn--primary')
      expect(startBtn.exists()).toBe(true)
      await startBtn.trigger('click')
      expect(wrapper.emitted('open-start-tx')).toEqual([
        [
          {
            chargingStationId: TEST_STATION_ID,
            connectorId: '2',
            evseId: 3,
            hashId: TEST_HASH_ID,
            ocppVersion: OCPPVersion.VERSION_16,
          },
        ],
      ])
    })

    it('should omit evseId/ocppVersion from emitted data when not set', async () => {
      wrapper = mountRow()
      await wrapper.find('.modern-icon-btn--primary').trigger('click')
      const emitted = wrapper.emitted('open-start-tx')?.[0]?.[0] as Record<string, unknown>
      expect(emitted.evseId).toBeUndefined()
      expect(emitted.ocppVersion).toBeUndefined()
    })

    it('should show stop icon when transaction running and stops it', async () => {
      wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionId: 99,
          transactionStarted: true,
        },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      const stopBtn = wrapper.find('.modern-icon-btn--danger')
      expect(stopBtn.exists()).toBe(true)
      await stopBtn.trigger('click')
      await flushPromises()
      expect(mockClient.stopTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({ ocppVersion: OCPPVersion.VERSION_16, transactionId: 99 })
      )
    })

    it('should toast error when stop is clicked without a transactionId', async () => {
      wrapper = mountRow({
        connector: { status: OCPP16ChargePointStatus.CHARGING, transactionStarted: true },
      })
      const stopBtn = wrapper.find('.modern-icon-btn--danger')
      await stopBtn.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
      expect(mockClient.stopTransaction).not.toHaveBeenCalled()
    })
  })

  describe('transaction details rendering', () => {
    it('should render energy in kWh when ≥ 1000 Wh', () => {
      wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionEnergyActiveImportRegisterValue: 1500,
          transactionId: 7,
          transactionStarted: true,
        },
      })
      expect(wrapper.text()).toContain('1.50 kWh')
    })

    it('should render energy in Wh when < 1000', () => {
      wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionEnergyActiveImportRegisterValue: 120,
          transactionId: 7,
          transactionStarted: true,
        },
      })
      expect(wrapper.text()).toContain('120 Wh')
    })

    it('should render "—" when energy value is missing', () => {
      wrapper = mountRow({
        connector: {
          status: OCPP16ChargePointStatus.CHARGING,
          transactionId: 7,
          transactionStarted: true,
        },
      })
      expect(wrapper.find('.modern-connector__tx-table').text()).toContain('—')
    })

    it('should render Tag row when transactionIdTag is set', () => {
      wrapper = mountRow({
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
