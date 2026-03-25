/**
 * @file Tests for StateButton component
 * @description Unit tests for label switching, active state CSS class, and on/off callback dispatch.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import StateButton from '@/components/buttons/StateButton.vue'

import { ButtonActiveStub } from './helpers'

/**
 * Mount factory — stubs Button with active class support
 * @param props - Component props
 * @param props.active - Whether the button is in active state
 * @param props.off - Callback when toggled off
 * @param props.offLabel - Label displayed when active
 * @param props.on - Callback when toggled on
 * @param props.onLabel - Label displayed when inactive
 * @returns Mounted wrapper
 */
function mountStateButton (props: {
  active: boolean
  off?: () => void
  offLabel: string
  on?: () => void
  onLabel: string
}) {
  return mount(StateButton, {
    global: {
      stubs: {
        Button: ButtonActiveStub,
      },
    },
    props,
  })
}

describe('StateButton', () => {
  it('should display onLabel when inactive', () => {
    const wrapper = mountStateButton({
      active: false,
      offLabel: 'Stop',
      onLabel: 'Start',
    })
    expect(wrapper.text()).toBe('Start')
  })

  it('should display offLabel when active', () => {
    const wrapper = mountStateButton({
      active: true,
      offLabel: 'Stop',
      onLabel: 'Start',
    })
    expect(wrapper.text()).toBe('Stop')
  })

  it('should call on callback when clicked while inactive', async () => {
    const onFn = vi.fn()
    const wrapper = mountStateButton({
      active: false,
      offLabel: 'Stop',
      on: onFn,
      onLabel: 'Start',
    })
    await wrapper.find('button').trigger('click')
    expect(onFn).toHaveBeenCalledOnce()
  })

  it('should call off callback when clicked while active', async () => {
    const offFn = vi.fn()
    const wrapper = mountStateButton({
      active: true,
      off: offFn,
      offLabel: 'Stop',
      onLabel: 'Start',
    })
    await wrapper.find('button').trigger('click')
    expect(offFn).toHaveBeenCalledOnce()
  })

  it('should apply button--active class when active', () => {
    const wrapper = mountStateButton({
      active: true,
      offLabel: 'Stop',
      onLabel: 'Start',
    })
    expect(wrapper.find('button').classes()).toContain('button--active')
  })

  it('should not apply button--active class when inactive', () => {
    const wrapper = mountStateButton({
      active: false,
      offLabel: 'Stop',
      onLabel: 'Start',
    })
    expect(wrapper.find('button').classes()).not.toContain('button--active')
  })
})
