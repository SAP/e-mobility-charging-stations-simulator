<template>
  <FlatButton>
    <span :class="{ spin: loading }"> &#8635; </span>
  </FlatButton>
</template>

<script setup lang="ts">
import FlatButton from '@/components/buttons/FlatButton.vue'

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
  animation-name: rotation;
  animation-duration: 2s;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
}
</style>
