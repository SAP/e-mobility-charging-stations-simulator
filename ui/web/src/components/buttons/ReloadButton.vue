<template>
  <Button>
    <span :class="{ spin: loading }"> &#8635; </span>
  </Button>
</template>

<script setup lang="ts">
import Button from '@/components/buttons/Button.vue'

defineProps<{
  loading: boolean
}>()
</script>

<style scoped>
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spin {
  animation: spin 2s linear infinite;
}
</style>
