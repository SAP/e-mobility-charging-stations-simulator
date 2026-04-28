/**
 * @file Tests for SetSupervisionUrl component
 * @description Unit tests for supervision URL form — display, submission, and navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SetSupervisionUrl from '@/components/actions/SetSupervisionUrl.vue'
import { uiClientKey } from '@/composables'

import { toastMock } from '../setup'
import { TEST_HASH_ID, TEST_STATION_ID } from './constants'
import { ButtonStub, createMockUIClient, type MockUIClient } from './helpers'

vi.mock('vue-router', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useRouter: vi.fn(),
  }
})

import { useRouter } from 'vue-router'

describe('SetSupervisionUrl', () => {
  let mockClient: MockUIClient
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  /**
   * @param props - Props to override defaults
   * @returns Mounted component wrapper
   */
  function mountComponent (props = {}) {
    mockClient = createMockUIClient()
    mockRouter = { push: vi.fn() }
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
    return mount(SetSupervisionUrl, {
      global: {
        provide: {
          [uiClientKey as symbol]: mockClient,
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

  it('should render supervision URL and credential inputs', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('#supervision-url').exists()).toBe(true)
    expect(wrapper.find('#supervision-user').exists()).toBe(true)
    expect(wrapper.find('#supervision-password').exists()).toBe(true)
  })

  it('should preserve existing credentials when only url is set', async () => {
    const wrapper = mountComponent()
    await wrapper.find('#supervision-url').setValue('wss://new-server.com:9000')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).toHaveBeenCalledWith(
      TEST_HASH_ID,
      'wss://new-server.com:9000',
      undefined,
      undefined
    )
  })

  it('should call setSupervisionUrl with credentials when all fields are set', async () => {
    const wrapper = mountComponent()
    await wrapper.find('#supervision-url').setValue('wss://new-server.com:9000')
    await wrapper.find('#supervision-user').setValue('alice')
    await wrapper.find('#supervision-password').setValue('secret')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).toHaveBeenCalledWith(
      TEST_HASH_ID,
      'wss://new-server.com:9000',
      'alice',
      'secret'
    )
  })

  it('should preserve password when only user is typed', async () => {
    const wrapper = mountComponent()
    await wrapper.find('#supervision-url').setValue('wss://new-server.com:9000')
    await wrapper.find('#supervision-user').setValue('alice')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).toHaveBeenCalledWith(
      TEST_HASH_ID,
      'wss://new-server.com:9000',
      'alice',
      undefined
    )
  })

  it('should not call setSupervisionUrl when url is empty', async () => {
    const wrapper = mountComponent()
    await wrapper.find('#supervision-user').setValue('alice')
    await wrapper.find('#supervision-password').setValue('secret')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockClient.setSupervisionUrl).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalled()
  })

  it('should navigate to charging-stations after submission', async () => {
    const wrapper = mountComponent()
    await wrapper.find('#supervision-url').setValue('wss://new-server.com:9000')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'charging-stations' })
  })

  it('should show error toast on failure', async () => {
    const wrapper = mountComponent()
    mockClient.setSupervisionUrl = vi.fn().mockRejectedValue(new Error('Network error'))
    await wrapper.find('#supervision-url').setValue('wss://new-server.com:9000')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })
})
