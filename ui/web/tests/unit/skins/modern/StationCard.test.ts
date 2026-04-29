/**
 * @file Tests for StationCard component
 * @description Header pills, connector enumeration, start/connect/delete, supervision/authorize events.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { type ChargingStationData, OCPP16AvailabilityType } from 'ui-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uiClientKey } from '@/composables'
import StationCard from '@/skins/modern/components/StationCard.vue'

import { toastMock } from '../../../setup.js'
import {
  createChargingStationData,
  createConnectorStatus,
  TEST_HASH_ID,
  TEST_STATION_ID,
} from '../../constants'
import { createMockUIClient, type MockUIClient } from '../../helpers.js'

let mockClient: MockUIClient
let wrapper: ReturnType<typeof mountCard> | undefined

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

describe('StationCard', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    wrapper?.unmount()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  describe('header', () => {
    it('should render the chargingStationId as title', () => {
      wrapper = mountCard()
      expect(wrapper.find('.modern-card__title').text()).toBe(TEST_STATION_ID)
    })

    it('should show "started" pill variant ok when started', () => {
      wrapper = mountCard({ started: true })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[0].classes()).toContain('modern-pill--ok')
      expect(pills[0].text()).toBe('started')
    })

    it('should show "stopped" pill variant err when stopped', () => {
      wrapper = mountCard({ started: false })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[0].classes()).toContain('modern-pill--err')
      expect(pills[0].text()).toBe('stopped')
    })

    it('should map wsState OPEN to modern-pill--ok', () => {
      wrapper = mountCard({ wsState: WebSocket.OPEN })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[1].classes()).toContain('modern-pill--ok')
    })

    it('should map wsState CLOSED to modern-pill--err', () => {
      wrapper = mountCard({ wsState: WebSocket.CLOSED })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[1].classes()).toContain('modern-pill--err')
    })

    it('should map wsState CLOSING to modern-pill--warn', () => {
      wrapper = mountCard({ wsState: WebSocket.CLOSING })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[1].classes()).toContain('modern-pill--warn')
    })

    it('should map wsState CONNECTING to modern-pill--warn', () => {
      wrapper = mountCard({ wsState: WebSocket.CONNECTING })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[1].classes()).toContain('modern-pill--warn')
    })

    it('should map unknown wsState (undefined) to modern-pill--idle', () => {
      wrapper = mountCard({ wsState: undefined })
      const pills = wrapper.findAll('.modern-card__pills .modern-pill')
      expect(pills[1].classes()).toContain('modern-pill--idle')
    })
  })

  describe('supervisionUrl display', () => {
    it('should render protocol://host without trailing "/"', () => {
      wrapper = mountCard({ supervisionUrl: 'wss://example.com:9000/' })
      expect(wrapper.find('.modern-card__url').text()).toBe('wss://example.com:9000')
    })

    it('should keep path segments other than "/"', () => {
      wrapper = mountCard({ supervisionUrl: 'wss://example.com/ocpp16' })
      expect(wrapper.find('.modern-card__url').text()).toBe('wss://example.com/ocpp16')
    })

    it('should fall back to the raw URL string on invalid URL', () => {
      wrapper = mountCard({ supervisionUrl: 'not-a-url' })
      expect(wrapper.find('.modern-card__url').text()).toBe('not-a-url')
    })

    it('should emit open-set-url on URL row click', async () => {
      wrapper = mountCard()
      await wrapper.find('.modern-card__url-edit').trigger('click')
      expect(wrapper.emitted('open-set-url')).toEqual([
        [{ chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID }],
      ])
    })

    it('should emit open-set-url on keyboard activation of URL edit button', async () => {
      wrapper = mountCard()
      // Native <button> elements fire click on Enter/Space in real browsers;
      // test-utils does not simulate this, so we trigger click directly
      await wrapper.find('.modern-card__url-edit').trigger('click')
      expect(wrapper.emitted('open-set-url')).toHaveLength(1)
    })
  })

  describe('connectors', () => {
    it('should render connectors from flat array', () => {
      wrapper = mountCard({
        connectors: [
          { connectorId: 1, connectorStatus: createConnectorStatus() },
          { connectorId: 2, connectorStatus: createConnectorStatus() },
        ],
      })
      expect(wrapper.findAll('.modern-connector')).toHaveLength(2)
    })

    it('should filter out connectorId=0 (server-wide placeholder)', () => {
      wrapper = mountCard({
        connectors: [
          { connectorId: 0, connectorStatus: createConnectorStatus() },
          { connectorId: 1, connectorStatus: createConnectorStatus() },
        ],
      })
      expect(wrapper.findAll('.modern-connector')).toHaveLength(1)
    })

    it('should flatten evses array when present', () => {
      wrapper = mountCard({
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
      expect(wrapper.findAll('.modern-connector')).toHaveLength(2)
    })

    it('should show empty-connectors message when no connectors', () => {
      wrapper = mountCard({ connectors: [] })
      expect(wrapper.text()).toContain('No connectors')
    })
  })

  describe('footer actions', () => {
    it('should label Start when stopped, calls startChargingStation', async () => {
      wrapper = mountCard({ started: false })
      const buttons = wrapper.findAll('.modern-card__foot-group .modern-btn')
      const startBtn = buttons.find(b => b.text() === 'Start')
      await startBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.startChargingStation).toHaveBeenCalled()
      expect(wrapper.emitted('need-refresh')).toHaveLength(1)
    })

    it('should label Stop when started, calls stopChargingStation', async () => {
      wrapper = mountCard({ started: true })
      const buttons = wrapper.findAll('.modern-card__foot-group .modern-btn')
      const stopBtn = buttons.find(b => b.text() === 'Stop')
      await stopBtn?.trigger('click')
      await flushPromises()
      expect(mockClient.stopChargingStation).toHaveBeenCalled()
    })

    it('should label Connect when WS closed, opens connection', async () => {
      wrapper = mountCard({ wsState: WebSocket.CLOSED })
      const buttons = wrapper.findAll('.modern-card__foot-group .modern-btn')
      const btn = buttons.find(b => b.text() === 'Connect')
      await btn?.trigger('click')
      await flushPromises()
      expect(mockClient.openConnection).toHaveBeenCalled()
    })

    it('should label Disconnect when WS open, closes connection', async () => {
      wrapper = mountCard({ wsState: WebSocket.OPEN })
      const buttons = wrapper.findAll('.modern-card__foot-group .modern-btn')
      const btn = buttons.find(b => b.text() === 'Disconnect')
      await btn?.trigger('click')
      await flushPromises()
      expect(mockClient.closeConnection).toHaveBeenCalled()
    })

    it('should emit open-authorize from footer', async () => {
      wrapper = mountCard()
      const buttons = wrapper.findAll('.modern-card__foot-group .modern-btn')
      const btn = buttons.find(b => b.text() === 'Authorize')
      await btn?.trigger('click')
      expect(wrapper.emitted('open-authorize')).toEqual([
        [{ chargingStationId: TEST_STATION_ID, hashId: TEST_HASH_ID }],
      ])
    })

    it('should open delete confirm dialog and cancel without an API call', async () => {
      wrapper = mountCard()
      const delBtn = wrapper.find('.modern-card__foot .modern-btn--danger')
      await delBtn.trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('Delete')
      const cancelBtn = document.body.querySelectorAll<HTMLButtonElement>(
        '.modern-modal__foot button'
      )[0]
      cancelBtn.click()
      await flushPromises()
      expect(mockClient.deleteChargingStation).not.toHaveBeenCalled()
    })

    it('should delete the station when delete confirm dialog is confirmed', async () => {
      wrapper = mountCard()
      const delBtn = wrapper.find('.modern-card__foot .modern-btn--danger')
      await delBtn.trigger('click')
      await flushPromises()
      const confirmBtn = document.body.querySelectorAll<HTMLButtonElement>(
        '.modern-modal__foot button'
      )[1]
      confirmBtn.click()
      await flushPromises()
      expect(mockClient.deleteChargingStation).toHaveBeenCalled()
    })

    it('should toast error when startChargingStation fails', async () => {
      mockClient.startChargingStation = vi.fn().mockRejectedValue(new Error('x'))
      wrapper = mountCard({ started: false })
      const btn = wrapper
        .findAll('.modern-card__foot-group .modern-btn')
        .find(b => b.text() === 'Start')
      await btn?.trigger('click')
      await flushPromises()
      expect(toastMock.error).toHaveBeenCalled()
    })
  })
})
