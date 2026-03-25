/**
 * @file Tests for ToggleButton component
 * @description Unit tests for toggle state, localStorage persistence, shared toggle behavior, and callbacks.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ToggleButton from '@/components/buttons/ToggleButton.vue'

import { ButtonActiveStub } from './helpers'

/**
 * Mount factory — stubs Button child component with slot passthrough
 * @param props - Component props
 * @param props.id - Unique identifier for the toggle
 * @param props.off - Callback when toggled off
 * @param props.on - Callback when toggled on
 * @param props.shared - Whether this is a shared toggle
 * @param props.status - Initial toggle status
 * @returns Mounted wrapper
 */
function mountToggleButton (
  props: {
    id: string
    off?: () => void
    on?: () => void
    shared?: boolean
    status?: boolean
  } = { id: 'test-toggle' }
) {
  return mount(ToggleButton, {
    global: {
      stubs: {
        Button: ButtonActiveStub,
      },
    },
    props,
    slots: { default: 'Toggle' },
  })
}

describe('ToggleButton', () => {
  describe('rendering', () => {
    it('should render slot content', () => {
      const wrapper = mountToggleButton({ id: 'render-test' })
      expect(wrapper.text()).toContain('Toggle')
    })

    it('should not apply on class when status is false', () => {
      const wrapper = mountToggleButton({ id: 'off-test', status: false })
      const button = wrapper.find('button')
      expect(button.classes()).not.toContain('button--active')
    })

    it('should apply on class when status is true', () => {
      const wrapper = mountToggleButton({ id: 'on-test', status: true })
      const button = wrapper.find('button')
      expect(button.classes()).toContain('button--active')
    })
  })

  describe('toggle behavior', () => {
    it('should toggle from inactive to active on click', async () => {
      const wrapper = mountToggleButton({ id: 'toggle-inactive-to-active', status: false })
      const button = wrapper.find('button')

      expect(button.classes()).not.toContain('button--active')
      await button.trigger('click')
      expect(button.classes()).toContain('button--active')
    })

    it('should toggle from active to inactive on click', async () => {
      const wrapper = mountToggleButton({ id: 'toggle-active-to-inactive', status: true })
      const button = wrapper.find('button')

      expect(button.classes()).toContain('button--active')
      await button.trigger('click')
      expect(button.classes()).not.toContain('button--active')
    })

    it('should call on callback when toggled to active', async () => {
      const onCallback = vi.fn()
      const wrapper = mountToggleButton({
        id: 'on-callback-test',
        off: vi.fn(),
        on: onCallback,
        status: false,
      })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(onCallback).toHaveBeenCalledOnce()
    })

    it('should call off callback when toggled to inactive', async () => {
      const offCallback = vi.fn()
      const wrapper = mountToggleButton({
        id: 'off-callback-test',
        off: offCallback,
        on: vi.fn(),
        status: true,
      })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(offCallback).toHaveBeenCalledOnce()
    })

    it('should emit clicked event with new boolean state', async () => {
      const wrapper = mountToggleButton({ id: 'emit-test', status: false })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(wrapper.emitted('clicked')?.[0]).toEqual([true])
    })

    it('should emit clicked event with false when toggling off', async () => {
      const wrapper = mountToggleButton({ id: 'emit-false-test', status: true })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(wrapper.emitted('clicked')?.[0]).toEqual([false])
    })
  })

  describe('localStorage persistence', () => {
    it('should save toggle state to localStorage on click', async () => {
      const wrapper = mountToggleButton({ id: 'persist-test', status: false })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(localStorage.getItem('toggle-button-persist-test')).toBe('true')
    })

    it('should restore toggle state from localStorage on mount', () => {
      localStorage.setItem('toggle-button-restore-test', 'true')
      const wrapper = mountToggleButton({ id: 'restore-test', status: false })
      const button = wrapper.find('button')

      expect(button.classes()).toContain('button--active')
    })

    it('should use correct localStorage key for non-shared toggle', async () => {
      const wrapper = mountToggleButton({ id: 'key-test', shared: false, status: false })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(localStorage.getItem('toggle-button-key-test')).toBe('true')
      expect(localStorage.getItem('shared-toggle-button-key-test')).toBeNull()
    })

    it('should use correct localStorage key for shared toggle', async () => {
      const wrapper = mountToggleButton({ id: 'shared-key-test', shared: true, status: false })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(localStorage.getItem('shared-toggle-button-shared-key-test')).toBe('true')
      expect(localStorage.getItem('toggle-button-shared-key-test')).toBeNull()
    })
  })

  describe('shared toggle behavior', () => {
    it('should reset other shared toggles when activated', async () => {
      localStorage.setItem('shared-toggle-button-other', 'true')

      const wrapper = mountToggleButton({ id: 'mine', shared: true, status: false })
      const button = wrapper.find('button')

      await button.trigger('click')

      expect(localStorage.getItem('shared-toggle-button-other')).toBe('false')
    })

    it('should not reset non-shared toggles when shared toggle is activated', async () => {
      localStorage.setItem('toggle-button-other', 'true')

      const wrapper = mountToggleButton({ id: 'shared-mine', shared: true, status: false })
      const button = wrapper.find('button')

      await button.trigger('click')

      expect(localStorage.getItem('toggle-button-other')).toBe('true')
    })

    it('should reset multiple other shared toggles when activated', async () => {
      localStorage.setItem('shared-toggle-button-first', 'true')
      localStorage.setItem('shared-toggle-button-second', 'true')

      const wrapper = mountToggleButton({ id: 'third', shared: true, status: false })
      const button = wrapper.find('button')

      await button.trigger('click')

      expect(localStorage.getItem('shared-toggle-button-first')).toBe('false')
      expect(localStorage.getItem('shared-toggle-button-second')).toBe('false')
    })
  })

  describe('edge cases', () => {
    it('should handle missing on callback gracefully', async () => {
      const wrapper = mountToggleButton({ id: 'no-on-callback', off: vi.fn(), status: false })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(wrapper.emitted('clicked')?.[0]).toEqual([true])
    })

    it('should handle missing off callback gracefully', async () => {
      const wrapper = mountToggleButton({ id: 'no-off-callback', on: vi.fn(), status: true })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(wrapper.emitted('clicked')?.[0]).toEqual([false])
    })

    it('should use default status false when not provided', () => {
      const wrapper = mountToggleButton({ id: 'default-status' })
      const button = wrapper.find('button')

      expect(button.classes()).not.toContain('button--active')
    })

    it('should handle multiple consecutive clicks', async () => {
      const wrapper = mountToggleButton({ id: 'multi-click', status: false })
      const button = wrapper.find('button')

      await button.trigger('click')
      expect(button.classes()).toContain('button--active')

      await button.trigger('click')
      expect(button.classes()).not.toContain('button--active')

      await button.trigger('click')
      expect(button.classes()).toContain('button--active')
    })
  })
})
