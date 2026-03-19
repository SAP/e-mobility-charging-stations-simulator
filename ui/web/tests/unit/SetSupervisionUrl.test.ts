/**
 * @file Tests for SetSupervisionUrl component
 * @description Unit tests for supervision URL form — display, submission, and navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SetSupervisionUrl from '@/components/actions/SetSupervisionUrl.vue'

import { toastMock } from '../setup'
import { TEST_HASH_ID, TEST_STATION_ID } from './constants'
import { ButtonStub, createMockUIClient, type MockUIClient } from './helpers'

describe('SetSupervisionUrl', () => {
  let mockClient: MockUIClient
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  /**
   * Mounts SetSupervisionUrl with mock UIClient, router, and toast.
   * @param props - Props to override defaults
   * @returns Mounted component wrapper
   */
  function mountComponent (props = {}) {
    mockClient = createMockUIClient()
    mockRouter = { push: vi.fn() }
    return mount(SetSupervisionUrl, {
      global: {
        config: {
          globalProperties: {
            $router: mockRouter,
            $toast: toastMock,
            $uiClient: mockClient,
          } as never,
        },
        stubs: {
          Button: ButtonStub,
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
    const wrapper = mountComponent()
    mockClient.setSupervisionUrl = vi.fn().mockRejectedValue(new Error('Network error'))
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })
})
