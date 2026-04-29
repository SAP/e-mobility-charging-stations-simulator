/**
 * @file Tests for modern presentational primitives
 * @description Unit tests for ActionButton, StatePill, Modal, and ConfirmDialog components.
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ActionButton from '@/skins/modern/components/ActionButton.vue'
import ConfirmDialog from '@/skins/modern/components/ConfirmDialog.vue'
import Modal from '@/skins/modern/components/Modal.vue'
import StatePill from '@/skins/modern/components/StatePill.vue'

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

describe('SimpleComponents', () => {
  describe('ActionButton', () => {
    it('should render slot content', () => {
      const wrapper = mount(ActionButton, { slots: { default: 'Go' } })
      expect(wrapper.text()).toContain('Go')
    })

    it('should emit click when clicked', async () => {
      const wrapper = mount(ActionButton)
      await wrapper.trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('should apply primary variant class', () => {
      const wrapper = mount(ActionButton, { props: { variant: 'primary' } })
      expect(wrapper.classes()).toContain('modern-btn--primary')
    })

    it('should apply danger variant class', () => {
      const wrapper = mount(ActionButton, { props: { variant: 'danger' } })
      expect(wrapper.classes()).toContain('modern-btn--danger')
    })

    it('should apply ghost variant class', () => {
      const wrapper = mount(ActionButton, { props: { variant: 'ghost' } })
      expect(wrapper.classes()).toContain('modern-btn--ghost')
    })

    it('should apply chip variant class', () => {
      const wrapper = mount(ActionButton, { props: { variant: 'chip' } })
      expect(wrapper.classes()).toContain('modern-btn--chip')
    })

    it('should apply icon modifier class when icon prop is true', () => {
      const wrapper = mount(ActionButton, { props: { icon: true } })
      expect(wrapper.classes()).toContain('modern-btn--icon')
    })

    it('should disable button when pending', () => {
      const wrapper = mount(ActionButton, { props: { pending: true } })
      const el = wrapper.element as HTMLButtonElement
      expect(el.disabled).toBe(true)
      expect(el.getAttribute('aria-busy')).toBe('true')
      expect(wrapper.find('.modern-btn__spinner').exists()).toBe(true)
    })

    it('should disable button when disabled prop is true', () => {
      const wrapper = mount(ActionButton, { props: { disabled: true } })
      const el = wrapper.element as HTMLButtonElement
      expect(el.disabled).toBe(true)
    })

    it('should apply the title attribute when provided', () => {
      const wrapper = mount(ActionButton, { props: { title: 'tip' } })
      expect(wrapper.attributes('title')).toBe('tip')
    })
  })

  describe('StatePill', () => {
    it.each([['ok'], ['warn'], ['err'], ['idle']] as const)(
      'should apply modern-pill--%s variant class',
      variant => {
        const wrapper = mount(StatePill, { props: { variant }, slots: { default: variant } })
        expect(wrapper.classes()).toContain(`modern-pill--${variant}`)
        expect(wrapper.text()).toBe(variant)
      }
    )
  })

  describe('Modal', () => {
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

    it('should render the title and slot content in body', async () => {
      const wrapper = mountModal()
      await nextTick()
      expect(document.body.textContent).toContain('Hello')
      expect(document.body.querySelector('[data-testid="first"]')).toBeTruthy()
      expect(document.body.querySelector('[data-testid="second"]')).toBeTruthy()
      wrapper.unmount()
    })

    it('should render the footer slot when provided', async () => {
      const wrapper = mountModal()
      await nextTick()
      expect(document.body.querySelector('.modern-modal__foot')).toBeTruthy()
      wrapper.unmount()
    })

    it('should emit close when the close button is clicked', async () => {
      const wrapper = mountModal()
      await nextTick()
      queryButton('.modern-modal__close').click()
      expect(wrapper.emitted('close')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should emit close when Escape is pressed', async () => {
      const wrapper = mountModal()
      await nextTick()
      const dialog = queryElement('.modern-modal')
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      expect(wrapper.emitted('close')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should emit close when backdrop is clicked (mousedown + mouseup on backdrop)', async () => {
      const wrapper = mountModal()
      await nextTick()
      const backdrop = queryElement('.modern-modal__backdrop')
      const down = new MouseEvent('mousedown', { bubbles: true })
      Object.defineProperty(down, 'target', { value: backdrop })
      backdrop.dispatchEvent(down)
      const up = new MouseEvent('mouseup', { bubbles: true })
      Object.defineProperty(up, 'target', { value: backdrop })
      backdrop.dispatchEvent(up)
      expect(wrapper.emitted('close')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should not emit close when mouseup target differs from backdrop (drag from input)', async () => {
      const wrapper = mountModal()
      await nextTick()
      const backdrop = queryElement('.modern-modal__backdrop')
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

    it('should not emit close on backdrop click when closeOnBackdrop is false', async () => {
      const wrapper = mountModal({ closeOnBackdrop: false })
      await nextTick()
      const backdrop = queryElement('.modern-modal__backdrop')
      const down = new MouseEvent('mousedown', { bubbles: true })
      Object.defineProperty(down, 'target', { value: backdrop })
      backdrop.dispatchEvent(down)
      const up = new MouseEvent('mouseup', { bubbles: true })
      Object.defineProperty(up, 'target', { value: backdrop })
      backdrop.dispatchEvent(up)
      expect(wrapper.emitted('close')).toBeUndefined()
      wrapper.unmount()
    })

    it('should trap Tab from last focusable back to first (close button)', async () => {
      const wrapper = mountModal()
      await nextTick()
      const dialog = queryElement('.modern-modal')
      const closeBtn = queryButton('.modern-modal__close')
      const button = queryButton('[data-testid="second"]')
      button.focus()
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
      dialog.dispatchEvent(event)
      expect(document.activeElement).toBe(closeBtn)
      wrapper.unmount()
    })

    it('should trap Shift+Tab from first focusable back to last', async () => {
      const wrapper = mountModal()
      await nextTick()
      const dialog = queryElement('.modern-modal')
      const closeBtn = queryButton('.modern-modal__close')
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

    it('should handle Tab with a single focusable by keeping focus', async () => {
      const wrapper = mount(Modal, {
        attachTo: document.body,
        props: { title: 'Empty' },
        slots: { default: '<span>no focusables here</span>' },
      })
      await nextTick()
      const dialog = queryElement('.modern-modal')
      const closeBtn = queryButton('.modern-modal__close')
      closeBtn.focus()
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' })
      )
      expect(document.activeElement).toBe(closeBtn)
      wrapper.unmount()
    })
  })

  describe('ConfirmDialog', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('should render title and message', async () => {
      const wrapper = mount(ConfirmDialog, {
        attachTo: document.body,
        props: { message: 'Are you sure?', title: 'Delete?' },
      })
      await nextTick()
      expect(document.body.textContent).toContain('Delete?')
      expect(document.body.textContent).toContain('Are you sure?')
      wrapper.unmount()
    })

    it('should use default cancel/confirm labels', async () => {
      const wrapper = mount(ConfirmDialog, {
        attachTo: document.body,
        props: { message: 'msg', title: 't' },
      })
      await nextTick()
      expect(document.body.textContent).toContain('Cancel')
      expect(document.body.textContent).toContain('Confirm')
      wrapper.unmount()
    })

    it('should respect custom labels', async () => {
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

    it('should emit cancel when the cancel button is clicked', async () => {
      const wrapper = mount(ConfirmDialog, {
        attachTo: document.body,
        props: { message: 'msg', title: 't' },
      })
      await nextTick()
      const buttons = document.body.querySelectorAll<HTMLButtonElement>(
        '.modern-modal__foot button'
      )
      buttons[0].click()
      expect(wrapper.emitted('cancel')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should emit confirm when the confirm button is clicked', async () => {
      const wrapper = mount(ConfirmDialog, {
        attachTo: document.body,
        props: { message: 'msg', title: 't' },
      })
      await nextTick()
      const buttons = document.body.querySelectorAll<HTMLButtonElement>(
        '.modern-modal__foot button'
      )
      buttons[1].click()
      expect(wrapper.emitted('confirm')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should emit cancel when the modal emits close', async () => {
      const wrapper = mount(ConfirmDialog, {
        attachTo: document.body,
        props: { message: 'msg', title: 't' },
      })
      await nextTick()
      queryButton('.modern-modal__close').click()
      expect(wrapper.emitted('cancel')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should pass pending and variant props to the confirm button', async () => {
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
      const buttons = document.body.querySelectorAll<HTMLButtonElement>(
        '.modern-modal__foot button'
      )
      expect(buttons[1].disabled).toBe(true)
      expect(buttons[1].classList.contains('modern-btn--primary')).toBe(true)
      wrapper.unmount()
    })
  })
})
