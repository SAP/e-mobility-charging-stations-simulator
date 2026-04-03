/**
 * @file Tests for simple presentational components
 * @description Unit tests for Button, Container, NotFoundView, and App.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from '@/App.vue'
import Button from '@/components/buttons/Button.vue'
import Container from '@/components/Container.vue'
import NotFoundView from '@/views/NotFoundView.vue'

const DummyComponent = defineComponent({ template: '<div />' })

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

describe('App', () => {
  it('should render Container component', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ component: DummyComponent, name: 'charging-stations', path: '/' }],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, {
      global: { plugins: [router] },
    })
    expect(wrapper.findComponent(Container).exists()).toBe(true)
  })

  it('should hide action container on charging-stations route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ component: DummyComponent, name: 'charging-stations', path: '/' }],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, {
      global: { plugins: [router] },
    })
    const actionContainer = wrapper.find('#action-container')
    // v-show hides via inline style display:none
    const element = actionContainer.element as HTMLElement
    expect(element.style.display).toBe('none')
  })
})
