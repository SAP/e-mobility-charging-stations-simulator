<template>
  <span :class="['v2-pill', `v2-pill--${variant}`]">
    <slot />
  </span>
</template>

<script setup lang="ts">
defineProps<{
  variant: 'err' | 'idle' | 'ok' | 'warn'
}>()
</script>
