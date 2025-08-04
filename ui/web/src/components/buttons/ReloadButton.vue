<template>
  <Button>
    <RefreshCcw :size="16" />
  </Button>
</template>

<script setup lang="ts">
import { RefreshCcw } from 'lucide-vue-next'

import Button from '@/components/buttons/Button.vue'

defineProps<{
  loading: boolean
}>()
</script>

<style>
@keyframes rotation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spin {
  animation: rotation 2s linear infinite;
}
</style>
