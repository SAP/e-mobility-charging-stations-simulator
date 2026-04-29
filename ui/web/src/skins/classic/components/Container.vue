<template>
  <div class="container">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ClassicContainer' })
</script>

<style scoped>
.container {
  flex: auto;
}
</style>
