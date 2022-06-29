<template>
  <FlatButton class="def-btn">
    <span style="display: inline-block" :class="{ 'spin': loading }">
      &#8635;
    </span>
  </FlatButton>
</template>

<script setup lang="ts">
import FlatButton from './buttons/FlatButton.vue';

const props = defineProps<{
  loading: boolean
}>();
</script>

<style>
@keyframes rotation {
  from { transform: rotate(0deg); }
  to { transform: rotate(359deg); }
}

.spin {
  animation-name: rotation;
  animation-duration: 2s;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
}
</style>