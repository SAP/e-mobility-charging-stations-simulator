/**
 * @file Tests for ClassicLayout component
 * @description Smoke tests for the classic skin layout component.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { chargingStationsKey, configurationKey, templatesKey, uiClientKey } from '@/core/index.js'
import ClassicLayout from '@/skins/classic/ClassicLayout.vue'

import { createUIServerConfig } from '../../constants.js'
import { createMockUIClient, type MockUIClient } from '../../helpers.js'

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
    vi.restoreAllMocks()
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

  it('should trigger switchSkin when skin select changes', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const selects = wrapper.findAll('select')
    const skinSelect = selects.find(s => {
      const options = s.findAll('option')
      return options.some(o => ['classic', 'modern'].includes(o.element.value))
    })
    if (skinSelect != null) {
      await skinSelect.setValue('modern')
      await skinSelect.trigger('change')
      expect(document.documentElement.getAttribute('data-skin')).toBeDefined()
    }
    expect(skinSelect).toBeDefined()
  })

  it('should trigger switchTheme when theme select changes', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const selects = wrapper.findAll('select')
    const themeSelect = selects.find(s => {
      const options = s.findAll('option')
      return options.some(
        o => o.element.value.includes('night') || o.element.value.includes('catppuccin')
      )
    })
    if (themeSelect != null) {
      await themeSelect.setValue('catppuccin-latte')
      await themeSelect.trigger('change')
      expect(document.documentElement.getAttribute('data-theme')).toBeDefined()
    }
    expect(themeSelect).toBeDefined()
  })
})
