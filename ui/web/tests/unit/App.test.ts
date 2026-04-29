/**
 * @file Tests for App root component
 * @description Smoke test verifying the App.vue skin switching shell mounts without errors.
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'

vi.mock('@/skins/registry.js', () => ({
  DEFAULT_SKIN: 'classic',
  skins: [
    {
      id: 'classic',
      label: 'Classic',
      loadLayout: () =>
        Promise.resolve({ default: { template: '<div class="classic-layout">Classic</div>' } }),
      loadStyles: vi.fn().mockResolvedValue(undefined),
    },
    {
      id: 'modern',
      label: 'Modern',
      loadLayout: () =>
        Promise.resolve({ default: { template: '<div class="modern-layout">Modern</div>' } }),
      loadStyles: vi.fn().mockResolvedValue(undefined),
    },
  ],
}))

describe('App', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
  })

  it('should mount the skin switching shell without errors', () => {
    const wrapper = mount(App)
    expect(wrapper.vm).toBeDefined()
    wrapper.unmount()
  })
})
