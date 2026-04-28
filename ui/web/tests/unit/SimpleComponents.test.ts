/**
 * @file Tests for simple presentational components
 * @description Unit tests for Button, Container, and NotFoundView.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Button from '@/components/buttons/Button.vue'
import Container from '@/components/Container.vue'
import NotFoundView from '@/views/NotFoundView.vue'

describe('Button', () => {
  it('should render slot content', () => {
    const wrapper = mount(Button, { slots: { default: 'Click me' } })
    expect(wrapper.text()).toContain('Click me')
  })

  it('should render a button element', () => {
    const wrapper = mount(Button)
    expect(wrapper.find('button').exists()).toBe(true)
  })
})

describe('Container', () => {
  it('should render slot content', () => {
    const wrapper = mount(Container, { slots: { default: 'Content' } })
    expect(wrapper.text()).toContain('Content')
  })

  it('should apply container class', () => {
    const wrapper = mount(Container)
    expect(wrapper.classes()).toContain('container')
  })
})

describe('NotFoundView', () => {
  it('should render 404 message', () => {
    const wrapper = mount(NotFoundView)
    expect(wrapper.text()).toContain('404')
    expect(wrapper.text()).toContain('Not found')
  })
})
