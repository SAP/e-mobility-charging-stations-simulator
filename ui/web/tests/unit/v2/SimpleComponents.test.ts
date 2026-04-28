/**
 * @file Tests for v2 presentational primitives
 * @description Unit tests for ActionButton, StatePill, Modal, ConfirmDialog, and V2NotFoundView.
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ActionButton from '@/v2/components/ActionButton.vue'
import ConfirmDialog from '@/v2/components/ConfirmDialog.vue'
import Modal from '@/v2/components/Modal.vue'
import StatePill from '@/v2/components/StatePill.vue'
import V2NotFoundView from '@/v2/views/V2NotFoundView.vue'

/**
 * Returns a required button as HTMLButtonElement — throws on no match.
 * @param selector CSS selector
 * @returns matched button
 */
function queryButton (selector: string): HTMLButtonElement {
  const el = document.body.querySelector<HTMLButtonElement>(selector)
  if (el == null) throw new Error(`Selector not found: ${selector}`)
  return el
}

/**
 * Returns a required element as HTMLElement — throws on no match.
 * @param selector CSS selector
 * @returns matched element
 */
function queryElement (selector: string): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(selector)
  if (el == null) throw new Error(`Selector not found: ${selector}`)
  return el
}

describe('v2 ActionButton', () => {
  it('renders slot content', () => {
    const wrapper = mount(ActionButton, { slots: { default: 'Go' } })
    expect(wrapper.text()).toContain('Go')
  })

  it('emits click when clicked', async () => {
    const wrapper = mount(ActionButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('applies primary variant class', () => {
    const wrapper = mount(ActionButton, { props: { variant: 'primary' } })
    expect(wrapper.classes()).toContain('v2-btn--primary')
  })

  it('applies danger variant class', () => {
    const wrapper = mount(ActionButton, { props: { variant: 'danger' } })
    expect(wrapper.classes()).toContain('v2-btn--danger')
  })

  it('applies ghost variant class', () => {
    const wrapper = mount(ActionButton, { props: { variant: 'ghost' } })
    expect(wrapper.classes()).toContain('v2-btn--ghost')
  })

  it('applies chip variant class', () => {
    const wrapper = mount(ActionButton, { props: { variant: 'chip' } })
    expect(wrapper.classes()).toContain('v2-btn--chip')
  })

  it('applies icon modifier class when icon prop is true', () => {
    const wrapper = mount(ActionButton, { props: { icon: true } })
    expect(wrapper.classes()).toContain('v2-btn--icon')
  })

  it('disables button when pending', () => {
    const wrapper = mount(ActionButton, { props: { pending: true } })
    const el = wrapper.element as HTMLButtonElement
    expect(el.disabled).toBe(true)
    expect(el.getAttribute('aria-busy')).toBe('true')
    expect(wrapper.find('.v2-btn__spinner').exists()).toBe(true)
  })

  it('disables button when disabled prop is true', () => {
    const wrapper = mount(ActionButton, { props: { disabled: true } })
    const el = wrapper.element as HTMLButtonElement
    expect(el.disabled).toBe(true)
  })

  it('applies the title attribute when provided', () => {
    const wrapper = mount(ActionButton, { props: { title: 'tip' } })
    expect(wrapper.attributes('title')).toBe('tip')
  })
})

describe('v2 StatePill', () => {
  it.each([
    ['ok'],
    ['warn'],
    ['err'],
    ['idle'],
  ] as const)('applies v2-pill--%s variant class', variant => {
    const wrapper = mount(StatePill, { props: { variant }, slots: { default: variant } })
    expect(wrapper.classes()).toContain(`v2-pill--${variant}`)
    expect(wrapper.text()).toBe(variant)
  })
})

describe('v2 Modal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  /**
   * @param props modal props
   * @param props.closeOnBackdrop whether clicking the backdrop closes the modal
   * @param props.title modal title text
   * @returns mounted wrapper
   */
  function mountModal (props: { closeOnBackdrop?: boolean; title?: string } = {}) {
    return mount(Modal, {
      attachTo: document.body,
      props: { title: 'Hello', ...props },
      slots: {
        default: '<input data-testid="first" /><button data-testid="second">x</button>',
        footer: '<span>F</span>',
      },
    })
  }

  it('renders the title and slot content in body', async () => {
    const wrapper = mountModal()
    await nextTick()
    expect(document.body.textContent).toContain('Hello')
    expect(document.body.querySelector('[data-testid="first"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="second"]')).toBeTruthy()
    wrapper.unmount()
  })

  it('renders the footer slot when provided', async () => {
    const wrapper = mountModal()
    await nextTick()
    expect(document.body.querySelector('.v2-modal__foot')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits close when the close button is clicked', async () => {
    const wrapper = mountModal()
    await nextTick()
    queryButton('.v2-modal__close').click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close when Escape is pressed', async () => {
    const wrapper = mountModal()
    await nextTick()
    const dialog = queryElement('.v2-modal')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close when backdrop is clicked (mousedown + mouseup on backdrop)', async () => {
    const wrapper = mountModal()
    await nextTick()
    const backdrop = queryElement('.v2-modal__backdrop')
    const down = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(down, 'target', { value: backdrop })
    backdrop.dispatchEvent(down)
    const up = new MouseEvent('mouseup', { bubbles: true })
    Object.defineProperty(up, 'target', { value: backdrop })
    backdrop.dispatchEvent(up)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not emit close when mouseup target differs from backdrop (drag from input)', async () => {
    const wrapper = mountModal()
    await nextTick()
    const backdrop = queryElement('.v2-modal__backdrop')
    const input = queryElement('[data-testid="first"]')
    // Mousedown on input (inside the modal), mouseup on backdrop — should NOT close.
    const down = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(down, 'target', { value: input })
    backdrop.dispatchEvent(down)
    const up = new MouseEvent('mouseup', { bubbles: true })
    Object.defineProperty(up, 'target', { value: backdrop })
    backdrop.dispatchEvent(up)
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not emit close on backdrop click when closeOnBackdrop is false', async () => {
    const wrapper = mountModal({ closeOnBackdrop: false })
    await nextTick()
    const backdrop = queryElement('.v2-modal__backdrop')
    const down = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(down, 'target', { value: backdrop })
    backdrop.dispatchEvent(down)
    const up = new MouseEvent('mouseup', { bubbles: true })
    Object.defineProperty(up, 'target', { value: backdrop })
    backdrop.dispatchEvent(up)
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('traps Tab from last focusable back to first (close button)', async () => {
    const wrapper = mountModal()
    await nextTick()
    const dialog = queryElement('.v2-modal')
    const closeBtn = queryButton('.v2-modal__close')
    const button = queryButton('[data-testid="second"]')
    button.focus()
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
    dialog.dispatchEvent(event)
    expect(document.activeElement).toBe(closeBtn)
    wrapper.unmount()
  })

  it('traps Shift+Tab from first focusable back to last', async () => {
    const wrapper = mountModal()
    await nextTick()
    const dialog = queryElement('.v2-modal')
    const closeBtn = queryButton('.v2-modal__close')
    const button = queryButton('[data-testid="second"]')
    closeBtn.focus()
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    })
    dialog.dispatchEvent(event)
    expect(document.activeElement).toBe(button)
    wrapper.unmount()
  })

  it('handles Tab with a single focusable by keeping focus', async () => {
    const wrapper = mount(Modal, {
      attachTo: document.body,
      props: { title: 'Empty' },
      slots: { default: '<span>no focusables here</span>' },
    })
    await nextTick()
    const dialog = queryElement('.v2-modal')
    const closeBtn = queryButton('.v2-modal__close')
    closeBtn.focus()
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
    )
    expect(document.activeElement).toBe(closeBtn)
    wrapper.unmount()
  })
})

describe('v2 ConfirmDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders title and message', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { message: 'Are you sure?', title: 'Delete?' },
    })
    await nextTick()
    expect(document.body.textContent).toContain('Delete?')
    expect(document.body.textContent).toContain('Are you sure?')
    wrapper.unmount()
  })

  it('uses default cancel/confirm labels', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { message: 'msg', title: 't' },
    })
    await nextTick()
    expect(document.body.textContent).toContain('Cancel')
    expect(document.body.textContent).toContain('Confirm')
    wrapper.unmount()
  })

  it('respects custom labels', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: {
        cancelLabel: 'No',
        confirmLabel: 'Yes',
        message: 'msg',
        title: 't',
      },
    })
    await nextTick()
    expect(document.body.textContent).toContain('No')
    expect(document.body.textContent).toContain('Yes')
    wrapper.unmount()
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { message: 'msg', title: 't' },
    })
    await nextTick()
    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.v2-modal__foot button')
    buttons[0].click()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { message: 'msg', title: 't' },
    })
    await nextTick()
    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.v2-modal__foot button')
    buttons[1].click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits cancel when the modal emits close', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { message: 'msg', title: 't' },
    })
    await nextTick()
    queryButton('.v2-modal__close').click()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('passes pending and variant props to the confirm button', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: {
        confirmLabel: 'Go',
        message: 'msg',
        pending: true,
        title: 't',
        variant: 'primary',
      },
    })
    await nextTick()
    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.v2-modal__foot button')
    expect(buttons[1].disabled).toBe(true)
    expect(buttons[1].classList.contains('v2-btn--primary')).toBe(true)
    wrapper.unmount()
  })
})

describe('v2 V2NotFoundView', () => {
  it('renders 404 message and back link', () => {
    const wrapper = mount(V2NotFoundView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(wrapper.text()).toContain('Page not found')
    expect(wrapper.text()).toContain('Back to charging stations')
  })
})
