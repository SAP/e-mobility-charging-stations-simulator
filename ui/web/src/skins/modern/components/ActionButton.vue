<template>
  <button
    type="button"
    :class="['modern-btn', variantClass, { 'modern-btn--icon': icon }]"
    :disabled="disabled || pending"
    :title="title"
    :aria-busy="pending || undefined"
  >
    <span
      v-if="pending"
      class="modern-btn__spinner"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>

<script setup lang="ts">
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

const variantClass = computed(() => {
  switch (props.variant) {
    case 'chip':
      return 'modern-btn--chip'
    case 'danger':
      return 'modern-btn--danger'
    case 'ghost':
      return 'modern-btn--ghost'
    case 'primary':
      return 'modern-btn--primary'
    default:
      return ''
  }
})
</script>
