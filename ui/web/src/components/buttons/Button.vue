<template>
  <button
    type="button"
    class="button"
  >
    <slot />
  </button>
</template>

<style>
.button {
  display: flex;
  flex: auto;
  justify-content: center;
  align-items: center;
  font: small-caption;
}
</style>
