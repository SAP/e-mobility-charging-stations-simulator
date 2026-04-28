<template>
  <button
    type="button"
    :class="['v2-btn', variantClass, { 'v2-btn--icon': icon }]"
    :disabled="disabled || pending"
    :title="title"
    :aria-busy="pending || undefined"
    @click="$emit('click', $event)"
  >
    <span
      v-if="pending"
      class="v2-btn__spinner"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>

<script setup lang="ts">
/* global MouseEvent */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    icon?: boolean
    pending?: boolean
    title?: string
    variant?: 'chip' | 'danger' | 'default' | 'ghost' | 'primary'
  }>(),
  {
    disabled: false,
    icon: false,
    pending: false,
    title: undefined,
    variant: 'default',
  }
)

defineEmits<{
  click: [event: MouseEvent]
}>()

const variantClass = computed(() => {
  switch (props.variant) {
    case 'chip':
      return 'v2-btn--chip'
    case 'danger':
      return 'v2-btn--danger'
    case 'ghost':
      return 'v2-btn--ghost'
    case 'primary':
      return 'v2-btn--primary'
    default:
      return ''
  }
})
</script>
