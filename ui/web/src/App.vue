<template>
  <router-view />
  <Container
    v-show="$route.name !== ROUTE_NAMES.CHARGING_STATIONS && $route.name !== ROUTE_NAMES.NOT_FOUND"
    id="action-container"
    class="action-container"
  >
    <router-view name="action" />
  </Container>
</template>

<script setup lang="ts">
import Container from '@/components/Container.vue'
import { ROUTE_NAMES } from '@/composables'
</script>

<style scoped>
#action-container {
  flex: none;
  min-width: max-content;
  height: fit-content;
  display: flex;
  position: sticky;
  top: 0;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  margin-inline: var(--spacing-sm);
  padding: var(--spacing-md);
  border: solid 0.25px var(--color-border);
}
</style>
