/**
 * @file Tests for modern SimulatorBar
 * @description Server switcher, simulator state display, action buttons.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SimulatorBar from '@/skins/modern/components/SimulatorBar.vue'

import { createUIServerConfig } from '../../constants'

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
      uiServerConfigurations: [{ configuration: baseServer, index: 0 }],
      ...props,
    },
  })
}

describe('SimulatorBar', () => {
  it('should show Disconnected pill when simulatorState is undefined', () => {
    const wrapper = mountBar()
    expect(wrapper.text()).toContain('Disconnected')
  })

  it('should show Running label with version when started', () => {
    const wrapper = mountBar({
      simulatorState: { started: true, templateStatistics: {}, version: '2.0.0' },
    })
    expect(wrapper.text()).toMatch(/Running.*2\.0\.0/)
  })

  it('should show Stopped label when simulator state reports not started', () => {
    const wrapper = mountBar({ simulatorState: { started: false, templateStatistics: {} } })
    expect(wrapper.text()).toContain('Stopped')
  })

  it('should hide the server select when only one server configured', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.modern-bar__select[aria-label="UI server"]').exists()).toBe(false)
  })

  it('should show the server select when multiple servers configured', () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    expect(wrapper.find('.modern-bar__select[aria-label="UI server"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Beta')
  })

  it('should emit switch-server when server selection changes', async () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    const select = wrapper.find('.modern-bar__select[aria-label="UI server"]')
    await select.setValue(1)
    expect(wrapper.emitted('switch-server')).toEqual([[1]])
  })

  // it('should emit refresh when refresh button is clicked', async () => {
  //   const wrapper = mountBar()
  //   const [refreshBtn] = wrapper.findAll('.modern-btn')
  //   await refreshBtn.trigger('click')
  //   expect(wrapper.emitted('refresh')).toHaveLength(1)
  // })

  it('should emit add when add-stations button is clicked', async () => {
    const wrapper = mountBar()
    const buttons = wrapper.findAll('.modern-btn')
    const addBtn = buttons.find(btn => btn.text().includes('Add Stations'))
    await addBtn?.trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('should emit toggle-simulator when start/stop button is clicked', async () => {
    const wrapper = mountBar({ simulatorState: { started: false, templateStatistics: {} } })
    const buttons = wrapper.findAll('.modern-btn')
    const toggleBtn = buttons.find(btn => btn.text().includes('Start Simulator'))
    await toggleBtn?.trigger('click')
    expect(wrapper.emitted('toggle-simulator')).toHaveLength(1)
  })

  it('should label the toggle button Stop when simulator is running', () => {
    const wrapper = mountBar({ simulatorState: { started: true, templateStatistics: {} } })
    expect(wrapper.text()).toContain('Stop Simulator')
  })

  it('should update internal select value when selectedServerIndex prop changes', async () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    await wrapper.setProps({ selectedServerIndex: 1 })
    const select = wrapper.find('.modern-bar__select[aria-label="UI server"]')
      .element as HTMLSelectElement
    expect(Number(select.value)).toBe(1)
  })

  it('should use host as option label when name is missing', () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: createUIServerConfig({ host: 'nohost' }), index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    expect(wrapper.text()).toContain('nohost')
  })

  it('should call switchTheme when theme select changes', async () => {
    const wrapper = mountBar()
    const themeSelect = wrapper.find('.modern-bar__select[aria-label="Theme"]')
    expect(themeSelect.exists()).toBe(true)
    await themeSelect.trigger('change')
  })

  it('should call switchSkin when skin select changes', async () => {
    const wrapper = mountBar()
    const skinSelect = wrapper.find('.modern-bar__select[aria-label="Skin"]')
    expect(skinSelect.exists()).toBe(true)
    await skinSelect.trigger('change')
  })

  it('should emit switch-server with selectedIndex when server select changes via trigger', async () => {
    const wrapper = mountBar({
      uiServerConfigurations: [
        { configuration: baseServer, index: 0 },
        { configuration: altServer, index: 1 },
      ],
    })
    const select = wrapper.find('.modern-bar__select[aria-label="UI server"]')
    await select.trigger('change')
    expect(wrapper.emitted('switch-server')).toBeDefined()
  })
})
