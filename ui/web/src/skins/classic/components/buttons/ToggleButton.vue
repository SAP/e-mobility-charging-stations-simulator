<template>
  <Button
    :active="state.status"
    @click="click()"
  >
    <slot />
  </Button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import {
  getFromLocalStorage,
  setToLocalStorage,
  SHARED_TOGGLE_BUTTON_KEY_PREFIX,
  TOGGLE_BUTTON_KEY_PREFIX,
} from '@/composables'

import Button from './Button.vue'

const props = defineProps<{
  id: string
  off?: () => void
  on?: () => void
  shared?: boolean
  status?: boolean
}>()

const $emit = defineEmits<{ clicked: [status: boolean] }>()

const id =
  props.shared === true
    ? `${SHARED_TOGGLE_BUTTON_KEY_PREFIX}${props.id}`
    : `${TOGGLE_BUTTON_KEY_PREFIX}${props.id}`

const state = ref<{ status: boolean }>({
  status: getFromLocalStorage<boolean>(id, props.status ?? false),
})

const click = (): void => {
  if (props.shared === true) {
    for (const key of Object.keys(localStorage)) {
      if (key !== id && key.startsWith(SHARED_TOGGLE_BUTTON_KEY_PREFIX)) {
        setToLocalStorage<boolean>(key, false)
      }
    }
  }
  const current = getFromLocalStorage<boolean>(id, props.status ?? false)
  const newStatus = !current
  setToLocalStorage<boolean>(id, newStatus)
  state.value.status = newStatus
  if (newStatus) {
    props.on?.()
  } else {
    props.off?.()
  }
  $emit('clicked', newStatus)
}
</script>
