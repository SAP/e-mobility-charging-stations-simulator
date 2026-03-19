/**
 * @file Tests for AddChargingStations component
 * @description Unit tests for add stations form — template selection, submission, and navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import AddChargingStations from '@/components/actions/AddChargingStations.vue'

import { toastMock } from '../setup'
import { ButtonStub, createMockUIClient, type MockUIClient } from './helpers'

describe('AddChargingStations', () => {
  let mockClient: MockUIClient
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  /**
   * Mounts AddChargingStations with mock UIClient, router, and templates.
   * @returns Mounted component wrapper
   */
  function mountComponent () {
    mockClient = createMockUIClient()
    mockRouter = { push: vi.fn() }
    return mount(AddChargingStations, {
      global: {
        config: {
          globalProperties: {
            $router: mockRouter,
            $templates: ref(['template-A.json', 'template-B.json']),
            $toast: toastMock,
            $uiClient: mockClient,
          } as never,
        },
        stubs: {
          Button: ButtonStub,
        },
      },
    })
  }

  it('should render template select dropdown', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('select').exists()).toBe(true)
  })

  it('should render template options from $templates', () => {
    const wrapper = mountComponent()
    const options = wrapper.findAll('option')
    expect(options.some(o => o.text().includes('template-A.json'))).toBe(true)
    expect(options.some(o => o.text().includes('template-B.json'))).toBe(true)
  })

  it('should render number of stations input', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('#number-of-stations').exists()).toBe(true)
  })

  it('should render supervision URL input', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('#supervision-url').exists()).toBe(true)
  })

  it('should call addChargingStations on button click', async () => {
    const wrapper = mountComponent()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockClient.addChargingStations).toHaveBeenCalled()
  })

  it('should navigate to charging-stations on success', async () => {
    const wrapper = mountComponent()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'charging-stations' })
  })

  it('should show error toast on failure', async () => {
    const wrapper = mountComponent()
    mockClient.addChargingStations = vi.fn().mockRejectedValue(new Error('Network error'))
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(toastMock.error).toHaveBeenCalled()
  })
})
