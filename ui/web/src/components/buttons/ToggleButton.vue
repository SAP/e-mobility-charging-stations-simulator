<template>
  <Button
    :class="[{ on: state.status }, className]"
    :appearance="appearance"
    :is-selected="isSelected"
    :spacing="spacing"
    :title="title"
    @click="click()"
  >
    <slot />
  </Button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { getFromLocalStorage, setToLocalStorage } from '@/composables'

const props = defineProps({
  appearance: {
    default: 'neutral',
    type: String
  },
  className: {
    default: '',
    type: String
  },
  id: {
    required: true,
    type: String
  },
  isSelected: {
    default: false,
    type: Boolean
  },
  off: {
    default: () => {},
    type: Function
  },
  on: {
    default: () => {},
    type: Function
  },
  shared: {
    default: false,
    type: Boolean
  },
  spacing: {
    default: 'default',
    type: String
  },
  status: {
    default: false,
    type: Boolean
  },
  title: {
    default: '',
    type: String
  }
})

const $emit = defineEmits(['clicked'])

const toggleId = props.shared === true ? `shared-toggle-button-${props.id}` : `toggle-button-${props.id}`

const state = ref<{ status: boolean }>({
  status: getFromLocalStorage<boolean>(toggleId, props.status ?? false),
})

const click = (): void => {
  // First check the current state
  const currentStatus = getFromLocalStorage<boolean>(toggleId, props.status ?? false)
  const newStatus = !currentStatus

  // Then handle shared toggle behavior
  if (props.shared === true) {
    for (const key in localStorage) {
      if (key !== toggleId && key.startsWith('shared-toggle-button-')) {
        setToLocalStorage<boolean>(key, false)
      }
    }
  }

  // Update the state
  setToLocalStorage<boolean>(toggleId, newStatus)
  state.value.status = newStatus

  // Call the appropriate function based on the new state
  if (newStatus) {
    props.on?.()
  } else {
    props.off?.()
  }

  // Emit the clicked event with the new state
  $emit('clicked', newStatus)
}
</script>

<style>
.on {
  background-color: lightgrey;
  border-style: inset;
}
</style>
