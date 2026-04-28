<template>
  <Button
    :active="active"
    @click="active ? off?.() : on?.()"
  >
    {{ active ? offLabel : onLabel }}
  </Button>
</template>

<script setup lang="ts">
import Button from './Button.vue'

defineProps<{
  active: boolean
  off?: () => void
  offLabel: string
  on?: () => void
  onLabel: string
}>()
</script>
