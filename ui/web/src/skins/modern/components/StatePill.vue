<template>
  <span :class="['modern-pill', `modern-pill--${variant}`]">
    <slot />
  </span>
</template>

<script setup lang="ts">
defineProps<{
  variant: 'err' | 'idle' | 'ok' | 'warn'
}>()
</script>
