/**
 * @file Tests for StartTransaction component
 * @description Unit tests for start transaction form — OCPP version branching, authorization flow, and navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import type { UIClient } from '@/composables/UIClient'

import StartTransaction from '@/components/actions/StartTransaction.vue'
import { useUIClient } from '@/composables'
import { OCPPVersion } from '@/types'

import { TEST_HASH_ID, TEST_ID_TAG, TEST_STATION_ID } from './constants'
import { createMockUIClient, type MockUIClient } from './helpers'

vi.mock('@/composables', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, useUIClient: vi.fn() }
})

vi.mock('vue-router', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useRoute: vi.fn(),
    useRouter: vi.fn(),
  }
})

import { useRoute, useRouter } from 'vue-router'

describe('StartTransaction', () => {
  let mockClient: MockUIClient
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  /**
   * Mounts StartTransaction with mock UIClient, router, and route query.
   * @param routeQuery - Route query parameters
   * @returns Mounted component wrapper
   */
  function mountComponent (routeQuery: Record<string, string> = {}) {
    mockClient = createMockUIClient()
    mockRouter = { push: vi.fn() }
    vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as UIClient)
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
    vi.mocked(useRoute).mockReturnValue({
      name: 'start-transaction',
      params: {
        chargingStationId: TEST_STATION_ID,
        connectorId: '1',
        hashId: TEST_HASH_ID,
      },
      query: routeQuery,
    } as unknown as ReturnType<typeof useRoute>)
    return mount(StartTransaction, {
      global: {
        stubs: {
          Button: {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
      props: {
        chargingStationId: TEST_STATION_ID,
        connectorId: '1',
        hashId: TEST_HASH_ID,
      },
    })
  }

  describe('display', () => {
    it('should display charging station ID', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain(TEST_STATION_ID)
    })

    it('should display connector ID without EVSE when no evseId', () => {
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Connector 1')
      expect(wrapper.text()).not.toContain('EVSE')
    })

    it('should display EVSE and connector when evseId in query', () => {
      const wrapper = mountComponent({
        evseId: '2',
        ocppVersion: OCPPVersion.VERSION_20,
      })
      expect(wrapper.text()).toContain('EVSE 2')
    })

    it('should show authorize checkbox for OCPP 1.6', () => {
      const wrapper = mountComponent({ ocppVersion: OCPPVersion.VERSION_16 })
      expect(wrapper.find('[type="checkbox"]').exists()).toBe(true)
    })

    it('should hide authorize checkbox for OCPP 2.0.x', () => {
      const wrapper = mountComponent({ ocppVersion: OCPPVersion.VERSION_20 })
      expect(wrapper.find('[type="checkbox"]').exists()).toBe(false)
    })
  })

  describe('OCPP 1.6 transaction flow', () => {
    it('should call startTransaction for OCPP 1.6', async () => {
      const wrapper = mountComponent({ ocppVersion: OCPPVersion.VERSION_16 })
      await wrapper.find('#idtag').setValue(TEST_ID_TAG)
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(mockClient.startTransaction).toHaveBeenCalledWith(TEST_HASH_ID, {
        connectorId: 1,
        evseId: undefined,
        idTag: TEST_ID_TAG,
        ocppVersion: OCPPVersion.VERSION_16,
      })
    })

    it('should call authorize before startTransaction when authorize checked', async () => {
      const wrapper = mountComponent({ ocppVersion: OCPPVersion.VERSION_16 })
      await wrapper.find('#idtag').setValue(TEST_ID_TAG)
      await wrapper.find('[type="checkbox"]').setValue(true)
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(mockClient.authorize).toHaveBeenCalledWith(TEST_HASH_ID, TEST_ID_TAG)
      expect(mockClient.startTransaction).toHaveBeenCalled()
    })
  })

  describe('OCPP 2.0.x transaction flow', () => {
    it('should call startTransaction for OCPP 2.0.x', async () => {
      const wrapper = mountComponent({ ocppVersion: OCPPVersion.VERSION_20 })
      await wrapper.find('#idtag').setValue(TEST_ID_TAG)
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(mockClient.startTransaction).toHaveBeenCalledWith(TEST_HASH_ID, {
        connectorId: 1,
        evseId: undefined,
        idTag: TEST_ID_TAG,
        ocppVersion: OCPPVersion.VERSION_20,
      })
    })

    it('should pass evseId when available', async () => {
      const wrapper = mountComponent({
        evseId: '2',
        ocppVersion: OCPPVersion.VERSION_20,
      })
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(mockClient.startTransaction).toHaveBeenCalledWith(
        TEST_HASH_ID,
        expect.objectContaining({ evseId: 2 })
      )
    })
  })

  describe('navigation', () => {
    it('should navigate back after transaction', async () => {
      const wrapper = mountComponent()
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(mockRouter.push).toHaveBeenCalledWith({ name: 'charging-stations' })
    })

    it('should show error toast on failure', async () => {
      const vueToast = await import('vue-toast-notification')
      const mockToast = { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }
      vi.spyOn(vueToast, 'useToast').mockReturnValue(
        mockToast as unknown as ReturnType<typeof vueToast.useToast>
      )
      mockClient = createMockUIClient()
      mockClient.startTransaction = vi.fn().mockRejectedValue(new Error('Failed'))
      vi.mocked(useUIClient).mockReturnValue(mockClient as unknown as UIClient)
      mockRouter = { push: vi.fn() }
      vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
      vi.mocked(useRoute).mockReturnValue({
        name: 'start-transaction',
        params: {
          chargingStationId: TEST_STATION_ID,
          connectorId: '1',
          hashId: TEST_HASH_ID,
        },
        query: {},
      } as unknown as ReturnType<typeof useRoute>)
      const wrapper = mount(StartTransaction, {
        global: {
          stubs: {
            Button: {
              emits: ['click'],
              template: '<button @click="$emit(\'click\')"><slot /></button>',
            },
          },
        },
        props: {
          chargingStationId: TEST_STATION_ID,
          connectorId: '1',
          hashId: TEST_HASH_ID,
        },
      })
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(mockToast.error).toHaveBeenCalled()
    })
  })
})
