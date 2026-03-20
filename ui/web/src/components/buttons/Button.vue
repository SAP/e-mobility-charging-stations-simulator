<template>
  <button
    class="button"
    type="button"
  >
    <slot />
  </button>
</template>

<style>
.button {
  display: block;
  flex: auto;
  width: 100%;
  text-align: center;
  font: small-caption;
}
</style>
