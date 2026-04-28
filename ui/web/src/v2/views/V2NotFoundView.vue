<template>
  <main class="v2-app">
    <div class="v2-empty">
      <div class="v2-empty__title">
        Page not found
      </div>
      <p>The page you're looking for doesn't exist in the v2 UI.</p>
      <RouterLink
        class="v2-bar__version-link"
        :to="{ name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS }"
      >
        Back to charging stations
      </RouterLink>
    </div>
  </main>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { V2_ROUTE_NAMES } from '../composables/v2Constants'
import '../assets/v2.css'
</script>
