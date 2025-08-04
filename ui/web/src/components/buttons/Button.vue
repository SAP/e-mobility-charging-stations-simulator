<template>
  <button
    :class="[buttonVariants({ appearance, spacing, isSelected }), className]"
    type="button"
  >
    <slot />
  </button>
</template>

<script setup>
import { cva } from 'class-variance-authority'
import { defineProps } from 'vue'

const props = defineProps({
  appearance: {
    default: 'neutral',
    type: String
  },
  className: {
    default: '',
    type: String
  },
  isSelected: {
    default: false,
    type: Boolean
  },
  spacing: {
    default: 'default',
    type: String
  }
})

const { appearance, className, isSelected, spacing } = props

const buttonVariants = cva(
  'inline-flex relative items-center cursor-pointer justify-center gap-2 whitespace-nowrap rounded-default text-default-color text-default font-bold leading-default px-default transition-colors disabled:pointer-events-none disabled:bg-input-disabled disabled:text-disabled',
  {
    defaultVariants: { appearance: 'neutral', spacing: undefined },
    variants: {
      appearance: {
        brand: 'text-inverse bg-brand-bold-primary-default hover:bg-brand-bold-primary-hover active:bg-brand-bold-primary-press',
        danger: 'text-inverse bg-danger-bold-default hover:bg-danger-bold-hover active:bg-danger-bold-press',
        link: 'text-link-default hover:text-link-hover active:text-link-press',
        navigation:
                    'bg-neutral-subtle-default hover:bg-neutral-subtle-hover active:bg-neutral-subtle-press',
        neutral:
                    'bg-neutral-default hover:bg-neutral-hover active:bg-neutral-press',
        none: 'bg-transparent p-0',
        subtle: 'bg-neutral-subtlest-default hover:bg-neutral-subtlest-hover active:bg-neutral-subtlest-press',
        'subtle link':
                    'text-subtle hover:underline  hover:underline-offset-4 active:text-default-color',
        warning:
                    'bg-warning-default hover:bg-warning-hover active:bg-warning-press',
      },
      isSelected: {
        false: null,
        true: 'bg-selected-default text-selected',
      },
      spacing: {
        compact: 'min-h-compact',
        default: 'min-h-default',
        none: 'min-h-0 p-0 px-0 py-0',
        relaxed: 'min-h-relaxed',
      },
    },
  }
)
</script>
