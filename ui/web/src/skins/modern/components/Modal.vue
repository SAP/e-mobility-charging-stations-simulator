<template>
  <Teleport to="body">
    <div
      class="modern-modal__backdrop"
      role="presentation"
      @mousedown="handleBackdropMouseDown"
      @mouseup="handleBackdropMouseUp"
    >
      <div
        ref="dialogEl"
        :aria-labelledby="titleId"
        class="modern-modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown.esc.stop="handleEsc"
        @keydown.tab="handleTab"
      >
        <header class="modern-modal__head">
          <h2
            :id="titleId"
            class="modern-modal__title"
          >
            {{ title }}
          </h2>
          <button
            type="button"
            class="modern-modal__close"
            aria-label="Close dialog"
            @click="$emit('close')"
          >
            ×
          </button>
        </header>
        <div class="modern-modal__body">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="modern-modal__foot"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/* global HTMLElement, HTMLDivElement, KeyboardEvent, MouseEvent */
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineOptions({ name: 'ModernModal' })

const props = withDefaults(
  defineProps<{
    closeOnBackdrop?: boolean
    title: string
  }>(),
  {
    closeOnBackdrop: true,
  }
)

const emit = defineEmits<{
  close: []
}>()

const dialogEl = ref<HTMLDivElement | null>(null)
const titleId = `modern-modal-${useId()}`
let previouslyFocused: HTMLElement | null = null

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const collectFocusables = (): HTMLElement[] => {
  if (dialogEl.value == null) return []
  return [...dialogEl.value.querySelectorAll<HTMLElement>(focusableSelector)]
}

const focusFirst = (): void => {
  if (dialogEl.value == null) return
  const focusables = collectFocusables()
  // Prefer first non-close button so the user lands on a real input.
  const target =
    focusables.find(el => !el.classList.contains('modern-modal__close')) ?? focusables[0]
  if (target != null) {
    target.focus()
  } else {
    dialogEl.value.focus()
  }
}

const handleEsc = (): void => {
  emit('close')
}

// Track whether the mouse was pressed down ON THE BACKDROP itself (not
// inside the modal). Closing only fires when both mousedown and mouseup
// happen on the backdrop — otherwise dragging a text selection from an
// input out past the modal edge would close the dialog.
let pressedOnBackdrop = false

const handleBackdropMouseDown = (event: MouseEvent): void => {
  pressedOnBackdrop = event.target === event.currentTarget
}

const handleBackdropMouseUp = (event: MouseEvent): void => {
  const wasPressedOnBackdrop = pressedOnBackdrop
  pressedOnBackdrop = false
  if (!wasPressedOnBackdrop) return
  if (event.target !== event.currentTarget) return
  if (props.closeOnBackdrop) emit('close')
}

const handleTab = (event: KeyboardEvent): void => {
  if (dialogEl.value == null) return
  const focusables = collectFocusables()
  if (focusables.length === 0) {
    event.preventDefault()
    dialogEl.value.focus()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  previouslyFocused = document.activeElement as HTMLElement | null
  nextTick(focusFirst).catch((error: unknown) => {
    console.error('Modal focus failed:', error)
  })
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  previouslyFocused?.focus?.()
})
</script>

<style scoped>
.modern-modal__backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--skin-backdrop-color);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--skin-space-4);
  z-index: 100;
  animation: modern-fade-in var(--skin-transition);
}

.modern-modal {
  background-color: var(--skin-surface-raised);
  color: var(--color-text);
  font-family: var(--skin-font);
  border: 1px solid var(--skin-border);
  border-radius: var(--skin-radius-lg);
  box-shadow: var(--skin-shadow-modal);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modern-pop var(--skin-transition);
}

.modern-modal__head {
  padding: var(--skin-space-4);
  border-bottom: 1px solid var(--skin-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--skin-space-3);
}

.modern-modal__title {
  margin: 0;
  font-family: var(--skin-font);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-strong);
  letter-spacing: -0.015em;
}

.modern-modal__close {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: var(--skin-space-1) var(--skin-space-2);
  border-radius: var(--skin-radius-sm);
  transition:
    background-color var(--skin-transition),
    color var(--skin-transition);
}

.modern-modal__close:hover {
  color: var(--color-text-strong);
  background-color: var(--skin-primary-ghost);
}

.modern-modal__body {
  padding: var(--skin-space-4);
  overflow: auto;
}

.modern-modal__foot {
  padding: var(--skin-space-3) var(--skin-space-4);
  border-top: 1px solid var(--skin-border);
  background-color: var(--skin-surface-sunken);
  display: flex;
  justify-content: flex-end;
  gap: var(--skin-space-2);
}

@keyframes modern-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modern-pop {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
