<template>
  <div :class="[tagVariants({ appearance: appearanceValue, isBold }), className]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { computed, defineProps } from 'vue'

const props = defineProps({
  appearance: {
    default: 'default',
    type: String,
    validator: (value: string) => ['brand', 'danger', 'default'].includes(value)
  },
  className: {
    default: '',
    type: String
  },
  isBold: {
    default: false,
    type: Boolean
  }
})

const { className, isBold } = props

// Use computed to ensure type safety
const appearanceValue = computed(() => {
  return props.appearance as 'brand' | 'danger' | 'default'
})

const tagVariants = cva(
  'inline-flex items-center gap-narrow rounded-narrow px-narrow py-narrower text-small min-h-6 font-bold leading-small transition-colors ring-offset-0',
  {
    compoundVariants: [
      {
        appearance: 'default',
        class: 'bg-neutral-bold-default hover:bg-neutral-bold-hover active:bg-neutral-bold-press',
        isBold: true,
      },
      {
        appearance: 'brand',
        class: 'bg-brand-bold-primary-default hover:bg-brand-bold-primary-hover active:bg-brand-bold-primary-press',
        isBold: true,
      },
    ],
    variants: {
      appearance: {
        brand: 'bg-brand-primary-default hover:bg-brand-primary-hover active:bg-brand-primary-press',
        danger: 'bg-danger-subtle-default hover:bg-danger-subtle-hover active:bg-danger-subtle-press text-danger',
        default: 'bg-neutral-subtle-default hover:bg-neutral-subtle-hover active:bg-neutral-subtle-press',
      },
      isBold: {
        false: null,
        true: 'text-inverse',
      },
    },
  }
)
</script>
