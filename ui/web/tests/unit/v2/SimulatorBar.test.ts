/**
 * @file Tests for v2 SimulatorBar
 * @description Server switcher, simulator state display, theme toggle, action buttons.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SimulatorBar from '@/v2/components/SimulatorBar.vue'

import { createUIServerConfig } from '../constants'

const baseServer = createUIServerConfig({ name: 'Alpha' })
const altServer = createUIServerConfig({ host: 'beta', name: 'Beta' })

/**
 * @param props overrides for SimulatorBar props
 * @returns mounted wrapper
 */
function mountBar (props: Record<string, unknown> = {}) {
  return mount(SimulatorBar, {
    global: { stubs: { RouterLink: true } },
    props: {
      selectedServerIndex: 0,
      themeMode: 'auto',
      uiServerConfigurations: [{ configuration: baseServer, index: 0 }],
      ...props,
    },
  })
}

describe('v2 SimulatorBar', () => {
  it('shows Disconnected pill when simulatorState is undefined', () => {
    const wrapper = mountBar()
    expect(wrapper.text()).toContain('Disconnected')
  })

  it('shows Running label with version when started', () => {
    const wrapper = mountBar({ simulatorState: { started: true, templateStatistics: {}, version: '2.0.0' } })
    expect(wrapper.text()).toMatch(/Running.*2\.0\.0/)
  })

  it('shows Stopped label when simulator state reports not started', () => {
    const wrapper = mountBar({ simulatorState: { started: false, templateStatistics: {} } })
    expect(wrapper.text()).toContain('Stopped')
  })

  it('hides the server select when only one server configured', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.v2-bar__select').exists()).toBe(false)
  })

  it('shows the server select when multiple servers configured', () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    expect(wrapper.find('.v2-bar__select').exists()).toBe(true)
    // Select uses name fallback to host
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Beta')
  })

  it('emits switch-server when server selection changes', async () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    const select = wrapper.find('.v2-bar__select')
    await select.setValue(1)
    expect(wrapper.emitted('switch-server')).toEqual([[1]])
  })

  it('emits refresh when refresh button is clicked', async () => {
    const wrapper = mountBar()
    const [refreshBtn] = wrapper.findAll('.v2-btn')
    await refreshBtn.trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('emits add when add-stations button is clicked', async () => {
    const wrapper = mountBar()
    const buttons = wrapper.findAll('.v2-btn')
    const addBtn = buttons.find(btn => btn.text().includes('Add Stations'))
    await addBtn?.trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('emits toggle-simulator when start/stop button is clicked', async () => {
    const wrapper = mountBar({ simulatorState: { started: false, templateStatistics: {} } })
    const buttons = wrapper.findAll('.v2-btn')
    const toggleBtn = buttons.find(btn => btn.text().includes('Start Simulator'))
    await toggleBtn?.trigger('click')
    expect(wrapper.emitted('toggle-simulator')).toHaveLength(1)
  })

  it('labels the toggle button Stop when simulator is running', () => {
    const wrapper = mountBar({ simulatorState: { started: true, templateStatistics: {} } })
    expect(wrapper.text()).toContain('Stop Simulator')
  })

  it('emits cycle-theme when the theme icon button is clicked', async () => {
    const wrapper = mountBar()
    const themeBtn = wrapper.find('.v2-icon-btn')
    await themeBtn.trigger('click')
    expect(wrapper.emitted('cycle-theme')).toHaveLength(1)
  })

  it.each([
    ['dark'],
    ['light'],
    ['auto'],
  ] as const)('renders theme %s icon', themeMode => {
    const wrapper = mountBar({ themeMode })
    expect(wrapper.find('.v2-icon-btn').attributes('title')).toContain(themeMode)
  })

  it('updates internal select value when selectedServerIndex prop changes', async () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    await wrapper.setProps({ selectedServerIndex: 1 })
    const select = wrapper.find('.v2-bar__select').element as HTMLSelectElement
    expect(Number(select.value)).toBe(1)
  })

  it('uses host as option label when name is missing', () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: createUIServerConfig({ host: 'nohost' }), index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    expect(wrapper.text()).toContain('nohost')
  })
})
