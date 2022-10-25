<template>
  <Button class="flat">
    <slot></slot>
  </Button>
</template>

<script setup lang="ts">
import Button from '@/components/buttons/Button.vue';
</script>

<style>
.flat {
  border: none;
}
</style>
