<template>
  <Container class="not-found">
    404 - Not found
  </Container>
</template>

<script setup lang="ts">
import Container from '@/components/Container.vue'
</script>

<style scoped>
.not-found {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 2rem;
  font-weight: bold;
}
</style>
