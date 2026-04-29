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

defineOptions({ name: 'V2Modal' })

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
  previouslyFocused = document.activeElement as HTMLElement | null
  nextTick(focusFirst).catch((error: unknown) => {
    console.error('Modal focus failed:', error)
  })
})

onBeforeUnmount(() => {
  previouslyFocused?.focus?.()
})
</script>
