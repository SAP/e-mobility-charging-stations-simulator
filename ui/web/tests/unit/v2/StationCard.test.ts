/**
 * @file Tests for v2 StationCard
 * @description Header pills, connector enumeration, start/connect/delete, supervision/authorize nav.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { type ChargingStationData, OCPP16AvailabilityType } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uiClientKey } from '@/composables'
import StationCard from '@/v2/components/StationCard.vue'

import { toastMock } from '../../setup'
import {
  createChargingStationData,
  createConnectorStatus,
  TEST_HASH_ID,
  TEST_STATION_ID,
} from '../constants'
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
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

/**
 * Mounts StationCard with default or overridden station data.
 * @param overrides partial ChargingStationData
 * @returns mounted wrapper
 */
function mountCard (overrides: Partial<ChargingStationData> = {}) {
  return mount(StationCard, {
    attachTo: document.body,
    global: { provide: { [uiClientKey as symbol]: mockClient } },
    props: {
      chargingStation: createChargingStationData(overrides),
    },
  })
}

describe('v2 StationCard', () => {
  describe('header', () => {
    it('renders the chargingStationId as title', () => {
      const wrapper = mountCard()
      expect(wrapper.find('.v2-card__title').text()).toBe(TEST_STATION_ID)
    })

    it('shows "started" pill variant ok when started', () => {
      const wrapper = mountCard({ started: true })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[0].classes()).toContain('v2-pill--ok')
      expect(pills[0].text()).toBe('started')
    })

    it('shows "stopped" pill variant err when stopped', () => {
      const wrapper = mountCard({ started: false })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[0].classes()).toContain('v2-pill--err')
      expect(pills[0].text()).toBe('stopped')
    })

    it('maps wsState OPEN to v2-pill--ok', () => {
      const wrapper = mountCard({ wsState: WebSocket.OPEN })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[1].classes()).toContain('v2-pill--ok')
    })

    it('maps wsState CLOSED to v2-pill--err', () => {
      const wrapper = mountCard({ wsState: WebSocket.CLOSED })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[1].classes()).toContain('v2-pill--err')
    })

    it('maps wsState CLOSING to v2-pill--warn', () => {
      const wrapper = mountCard({ wsState: WebSocket.CLOSING })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[1].classes()).toContain('v2-pill--warn')
    })

    it('maps wsState CONNECTING to v2-pill--warn', () => {
      const wrapper = mountCard({ wsState: WebSocket.CONNECTING })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[1].classes()).toContain('v2-pill--warn')
    })

    it('maps unknown wsState (undefined) to v2-pill--idle', () => {
      const wrapper = mountCard({ wsState: undefined })
      const pills = wrapper.findAll('.v2-card__pills .v2-pill')
      expect(pills[1].classes()).toContain('v2-pill--idle')
    })
  })

  describe('supervisionUrl display', () => {
    it('renders protocol://host without trailing "/"', () => {
      const wrapper = mountCard({ supervisionUrl: 'wss://example.com:9000/' })
      expect(wrapper.find('.v2-card__url').text()).toBe('wss://example.com:9000')
    })

    it('keeps path segments other than "/"', () => {
      const wrapper = mountCard({ supervisionUrl: 'wss://example.com/ocpp16' })
      expect(wrapper.find('.v2-card__url').text()).toBe('wss://example.com/ocpp16')
    })

    it('falls back to the raw URL string on invalid URL', () => {
      const wrapper = mountCard({ supervisionUrl: 'not-a-url' })
      expect(wrapper.find('.v2-card__url').text()).toBe('not-a-url')
    })

    it('navigates to supervision dialog on URL row click', async () => {
      const wrapper = mountCard()
      await wrapper.find('.v2-card__url-row').trigger('click')
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'v2-set-supervision-url',
          params: { chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID },
        })
      )
    })

    it('navigates on Enter key press of URL row', async () => {
      const wrapper = mountCard()
      await wrapper.find('.v2-card__url-row').trigger('keydown.enter')
      expect(mockRouter.push).toHaveBeenCalled()
    })
  })

  describe('connectors', () => {
    it('renders connectors from flat array', () => {
      const wrapper = mountCard({
        connectors: [
          { connectorId: 1, connectorStatus: createConnectorStatus() },
          { connectorId: 2, connectorStatus: createConnectorStatus() },
        ],
      })
      expect(wrapper.findAll('.v2-connector')).toHaveLength(2)
    })

    it('filters out connectorId=0 (server-wide placeholder)', () => {
      const wrapper = mountCard({
        connectors: [
          { connectorId: 0, connectorStatus: createConnectorStatus() },
          { connectorId: 1, connectorStatus: createConnectorStatus() },
        ],
      })
      expect(wrapper.findAll('.v2-connector')).toHaveLength(1)
    })

    it('flattens evses array when present', () => {
      const wrapper = mountCard({
        connectors: undefined,
        evses: [
          {
            evseId: 1,
            evseStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              connectors: [
                { connectorId: 0, connectorStatus: createConnectorStatus() },
                { connectorId: 1, connectorStatus: createConnectorStatus() },
                { connectorId: 2, connectorStatus: createConnectorStatus() },
              ],
            },
          },
          // evseId 0 is skipped
          {
            evseId: 0,
            evseStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              connectors: [{ connectorId: 1, connectorStatus: createConnectorStatus() }],
            },
          },
        ],
      })
      expect(wrapper.findAll('.v2-connector')).toHaveLength(2)
    })

    it('shows empty-connectors message when no connectors', () => {
      const wrapper = mountCard({ connectors: [] })
      expect(wrapper.text()).toContain('No connectors')
    })
  })

  describe('footer actions', () => {
    it('labels Start when stopped, calls startChargingStation', async () => {
      const wrapper = mountCard({ started: false })
      const buttons = wrapper.findAll('.v2-card__foot-group .v2-btn')
      const startBtn = buttons.find(b => b.text() === 'Start')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.startChargingStation).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalled()
      expect(wrapper.emitted('need-refresh')).toBeTruthy()
    })

    it('labels Stop when started, calls stopChargingStation', async () => {
      const wrapper = mountCard({ started: true })
      const buttons = wrapper.findAll('.v2-card__foot-group .v2-btn')
      const stopBtn = buttons.find(b => b.text() === 'Stop')
      await stopBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.stopChargingStation).toHaveBeenCalledWith(TEST_HASH_ID)
    })

    it('labels Connect when WS closed, opens connection', async () => {
      const wrapper = mountCard({ wsState: WebSocket.CLOSED })
      const buttons = wrapper.findAll('.v2-card__foot-group .v2-btn')
      const btn = buttons.find(b => b.text() === 'Connect')
      await btn?.trigger('click')
      await flushPromises()
      expect(mockClient.openConnection).toHaveBeenCalledWith(TEST_HASH_ID)
    })

    it('labels Disconnect when WS open, closes connection', async () => {
      const wrapper = mountCard({ wsState: WebSocket.OPEN })
      const buttons = wrapper.findAll('.v2-card__foot-group .v2-btn')
      const btn = buttons.find(b => b.text() === 'Disconnect')
      await btn?.trigger('click')
      await flushPromises()
      expect(mockClient.closeConnection).toHaveBeenCalledWith(TEST_HASH_ID)
    })

    it('navigates to authorize dialog from footer', async () => {
      const wrapper = mountCard()
      const buttons = wrapper.findAll('.v2-card__foot-group .v2-btn')
      const btn = buttons.find(b => b.text() === 'Authorize')
      await btn?.trigger('click')
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'v2-authorize',
          params: { chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID },
        })
      )
    })

    it('opens delete confirm dialog and cancels without API call', async () => {
      const wrapper = mountCard()
      const delBtn = wrapper.find('.v2-card__foot .v2-btn--danger')
      await delBtn.trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('Delete')
      const cancelBtn =
        document.body.querySelectorAll<HTMLButtonElement>('.v2-modal__foot button')[0]
      cancelBtn.click()
      await flushPromises()
      expect(mockClient.deleteChargingStation).not.toHaveBeenCalled()
    })

    it('deletes when delete confirm dialog is confirmed', async () => {
      const wrapper = mountCard()
      const delBtn = wrapper.find('.v2-card__foot .v2-btn--danger')
      await delBtn.trigger('click')
      await flushPromises()
      const confirmBtn =
        document.body.querySelectorAll<HTMLButtonElement>('.v2-modal__foot button')[1]
      confirmBtn.click()
      await flushPromises()
      expect(mockClient.deleteChargingStation).toHaveBeenCalledWith(TEST_HASH_ID)
      expect(toastMock.success).toHaveBeenCalled()
    })

    it('toasts error when startChargingStation fails', async () => {
      mockClient.startChargingStation = vi.fn().mockRejectedValue(new Error('x'))
      const wrapper = mountCard({ started: false })
      const btn = wrapper.findAll('.v2-card__foot-group .v2-btn').find(b => b.text() === 'Start')
      await btn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
    })
  })
})
