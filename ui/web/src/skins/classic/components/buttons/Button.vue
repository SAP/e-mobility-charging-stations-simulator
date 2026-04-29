<template>
  <button
    :class="['classic-button', { 'classic-button--active': active }]"
    type="button"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineOptions({ name: 'ClassicButton' })

withDefaults(
  defineProps<{
    active?: boolean
  }>(),
  {
    active: false,
  }
)
</script>

<style scoped>
.classic-button {
  display: block;
  width: 100%;
  text-align: center;
  font-size: var(--font-size-sm);
}

.classic-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.classic-button--active {
  color: var(--color-text);
  background-color: var(--color-bg-active);
  border: 1px solid var(--color-accent);
  box-shadow: inset 0 2px 4px var(--color-shadow-inset);
}
</style>
