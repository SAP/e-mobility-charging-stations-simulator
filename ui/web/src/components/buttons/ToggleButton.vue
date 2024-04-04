<template>
  <Button :class="{ on: state.status }" @click="click()">
    <slot></slot>
  </Button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { getFromLocalStorage, setToLocalStorage } from '@/composables'

const props = defineProps<{
  id: string
  status?: boolean
  shared?: boolean
  on?: () => void
  off?: () => void
}>()

const $emit = defineEmits(['clicked'])

const id = props.shared === true ? `shared-toggle-button-${props.id}` : `toggle-button-${props.id}`

const state = ref<{ status: boolean }>({
  status: getFromLocalStorage<boolean>(id, props.status ?? false)
})

const click = (): void => {
  if (props.shared === true) {
    for (const key in localStorage) {
      if (key !== id && key.startsWith('shared-toggle-button-')) {
        setToLocalStorage<boolean>(key, false)
        state.value.status = getFromLocalStorage<boolean>(key, false)
      }
    }
  }
  setToLocalStorage<boolean>(id, !getFromLocalStorage<boolean>(id, props.status ?? false))
  state.value.status = getFromLocalStorage<boolean>(id, props.status ?? false)
  if (getFromLocalStorage<boolean>(id, props.status ?? false)) {
    props.on?.()
  } else {
    props.off?.()
  }
  $emit('clicked', getFromLocalStorage<boolean>(id, props.status ?? false))
}
</script>

<style>
.on {
  background-color: lightgrey;
  border-style: inset;
}
</style>
