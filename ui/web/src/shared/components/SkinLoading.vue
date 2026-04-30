<template>
  <div class="skin-loading">
    <div class="skin-loading__spinner" />
    <p>Loading…</p>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SkinLoading' })
</script>

<style scoped>
.skin-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 50vh;
  padding: 2rem;
  color: var(--color-text);
  font-family: system-ui, sans-serif;
}

.skin-loading__spinner {
  width: 24px;
  height: 24px;
  border: 3px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: skin-spin 700ms linear infinite;
}

@keyframes skin-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
