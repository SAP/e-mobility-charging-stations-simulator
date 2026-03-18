/**
 * @file Tests for SetSupervisionUrl component
 * @description Unit tests for supervision URL form — display, submission, and navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SetSupervisionUrl from '@/components/actions/SetSupervisionUrl.vue'

import { TEST_HASH_ID, TEST_STATION_ID } from './constants'
import { createMockUIClient, type MockUIClient } from './helpers'

const mockToast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

describe('SetSupervisionUrl', () => {
  let mockClient: MockUIClient
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  /**
   *
   * @param props
   */
  function mountComponent (props = {}) {
    mockClient = createMockUIClient()
    mockRouter = { push: vi.fn() }
    return mount(SetSupervisionUrl, {
      global: {
        config: {
          globalProperties: {
            $router: mockRouter,
            $toast: mockToast,
            $uiClient: mockClient,
          } as never,
        },
        stubs: {
          Button: {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
      props: {
        chargingStationId: TEST_STATION_ID,
        hashId: TEST_HASH_ID,
        ...props,
      },
    })
  }

  it('should display the charging station ID', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain(TEST_STATION_ID)
  })

  it('should render supervision URL input', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('#supervision-url').exists()).toBe(true)
  })

  it('should call setSupervisionUrl on button click', async () => {
    const wrapper = mountComponent()
    const input = wrapper.find('#supervision-url')
    await input.setValue('wss://new-server.com:9000')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).toHaveBeenCalledWith(
      TEST_HASH_ID,
      'wss://new-server.com:9000'
    )
  })

  it('should navigate to charging-stations after submission', async () => {
    const wrapper = mountComponent()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'charging-stations' })
  })

  it('should show error toast on failure', async () => {
    mockClient = createMockUIClient()
    mockClient.setSupervisionUrl = vi.fn().mockRejectedValue(new Error('Network error'))
    mockRouter = { push: vi.fn() }
    const wrapper = mount(SetSupervisionUrl, {
      global: {
        config: {
          globalProperties: {
            $router: mockRouter,
            $toast: mockToast,
            $uiClient: mockClient,
          } as never,
        },
        stubs: {
          Button: {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
      props: {
        chargingStationId: TEST_STATION_ID,
        hashId: TEST_HASH_ID,
      },
    })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockToast.error).toHaveBeenCalled()
  })
})
