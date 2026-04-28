<template>
  <div class="skin-load-error">
    <p>Failed to load skin layout.</p>
    <button @click="$emit('retry')">
      Retry
    </button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ retry: [] }>()
</script>

<style scoped>
.skin-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 50vh;
  padding: 2rem;
  color: var(--color-text, #e0e0e0);
  font-family: system-ui, sans-serif;
}

.skin-load-error button {
  padding: 0.5rem 1.25rem;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.875rem;
}

.skin-load-error button:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
