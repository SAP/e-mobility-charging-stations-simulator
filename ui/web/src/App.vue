<template>
  <router-view />
  <Container
    v-show="
      isV1Route &&
        $route.name !== ROUTE_NAMES.CHARGING_STATIONS &&
        $route.name !== ROUTE_NAMES.NOT_FOUND
    "
    id="action-container"
    class="action-container"
  >
    <router-view name="action" />
  </Container>
  <router-view name="v2-action" />
  <RouterLink
    v-if="isV1Route"
    class="ui-version-link"
    :to="{ name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS }"
  >
    Try v2 →
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import Container from '@/components/Container.vue'
import { ROUTE_NAMES } from '@/composables'
import { V2_ROUTE_NAMES } from '@/v2/composables/v2Constants'

const $route = useRoute()
const v2RouteNames = new Set<string>(Object.values(V2_ROUTE_NAMES))
const isV1Route = computed(() => !v2RouteNames.has(String($route.name ?? '')))
</script>

<style scoped>
.ui-version-link {
  position: fixed;
  bottom: var(--spacing-md);
  right: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted, var(--color-text));
  text-decoration: none;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border-row);
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
  z-index: 50;
}

.ui-version-link:hover {
  color: var(--color-primary, var(--color-accent));
  border-color: var(--color-primary, var(--color-accent));
}
</style>

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
