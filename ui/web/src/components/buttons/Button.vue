<template>
  <button type="button" class="button">
    <slot></slot>
  </button>
</template>

<style>
.button {
  display: flex;
  flex: auto;
  align-items: center;
  justify-content: center;
}
</style>
