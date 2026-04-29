/**
 * @file ClassicLayout.test.ts
 * @description Smoke tests for the classic skin layout component.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { chargingStationsKey, configurationKey, templatesKey, uiClientKey } from '@/composables'
import ClassicLayout from '@/skins/classic/ClassicLayout.vue'

import { createUIServerConfig } from '../../constants'
import { createMockUIClient, type MockUIClient } from '../../helpers'

vi.mock('vue-router', () => ({
  useRoute: () => ref({ name: 'charging-stations', params: {} }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

let mockClient: MockUIClient

const singleServer = { uiServer: [createUIServerConfig({ name: 'A' })] }

/**
 * @returns Mounted wrapper for ClassicLayout with default stubs
 */
function mountLayout () {
  return mount(ClassicLayout, {
    global: {
      provide: {
        [chargingStationsKey as symbol]: ref([]),
        [configurationKey as symbol]: ref(singleServer),
        [templatesKey as symbol]: ref([]),
        [uiClientKey as symbol]: mockClient,
      },
      stubs: {
        CSTable: true,
        RouterView: true,
      },
    },
  })
}

describe('ClassicLayout', () => {
  beforeEach(() => {
    mockClient = createMockUIClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render without crashing', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })

  it('should render the skin selector', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const selects = wrapper.findAll('select')
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('should contain the classic layout root element', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.find('.classic-layout').exists()).toBe(true)
  })
})
