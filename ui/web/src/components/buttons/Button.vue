<template>
  <button
    class="button"
    type="button"
  >
    <slot />
  </button>
</template>

<style scoped>
.button {
  display: block;
  width: 100%;
  text-align: center;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
