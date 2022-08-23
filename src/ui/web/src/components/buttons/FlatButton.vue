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
  /* cursor: pointer; */
  /* background-color: rgb(25, 118, 210);
  color: white; */
  /* padding: 6px 14px;
  font-size: 35px; */
  /* font-weight: bold;
  border-radius: 5px; */
}

/* .button:hover {
  background-color: rgb(10, 113, 195);
}

.button:active {
  background-color: rgb(255, 113, 195);
} */
</style>
