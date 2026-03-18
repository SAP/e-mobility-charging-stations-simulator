/**
 * @file Tests for AddChargingStations component
 * @description Unit tests for add stations form — template selection, submission, and navigation.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import AddChargingStations from '@/components/actions/AddChargingStations.vue'

import { createMockUIClient, type MockUIClient } from './helpers'

const mockToast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

describe('AddChargingStations', () => {
  let mockClient: MockUIClient
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  /**
   *
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
    mockClient = createMockUIClient()
    mockClient.addChargingStations = vi.fn().mockRejectedValue(new Error('Network error'))
    mockRouter = { push: vi.fn() }
    const wrapper = mount(AddChargingStations, {
      global: {
        config: {
          globalProperties: {
            $router: mockRouter,
            $templates: ref([]),
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
    })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(mockToast.error).toHaveBeenCalled()
  })
})
