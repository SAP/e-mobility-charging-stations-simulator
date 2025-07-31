<template>
  <div :class="[badgeVariants({ appearance: appearanceValue, isBold }), className]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { computed, defineProps } from 'vue'

type AppearanceType = 'announcement' | 'danger' | 'information' | 'neutral' | 'success' | 'warning'

const props = defineProps({
  appearance: {
    default: 'neutral',
    type: String,
    validator: (value: string) => ['announcement', 'danger', 'information', 'neutral', 'success', 'warning'].includes(value)
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
  return props.appearance as AppearanceType
})

const badgeVariants = cva(
  'inline-flex items-center rounded-narrow px-1.5 py-narrow text-smallest text-default-color font-bolder leading-smallest tracking-wider uppercase transition-colors',
  {
    compoundVariants: [
      {
        appearance: 'success',
        class: 'bg-success-bold-default',
        isBold: true,
      },
      {
        appearance: 'warning',
        class: 'bg-warning-bold-default',
        isBold: true,
      },
      {
        appearance: 'danger',
        class: 'bg-danger-bold-default',
        isBold: true,
      },
      {
        appearance: 'announcement',
        class: 'bg-announcement-bold-default',
        isBold: true,
      },
      {
        appearance: 'information',
        class: 'bg-information-bold-default',
        isBold: true,
      },
      {
        appearance: 'neutral',
        class: 'bg-neutral-bold-default',
        isBold: true,
      },
    ],
    variants: {
      appearance: {
        announcement: 'bg-announcement-default',
        danger: 'bg-danger-default',
        information: 'bg-information-default',
        neutral: 'bg-neutral-default',
        success: 'bg-success-default',
        warning: 'bg-warning-default',
      },
      isBold: {
        false: null,
        true: 'text-inverse',
      },
    },
  }
)
</script>
