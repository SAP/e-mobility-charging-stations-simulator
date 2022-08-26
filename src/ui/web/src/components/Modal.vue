<template>
  <teleport to="body">
    <div id="backdrop" v-if="props.visibility" @click.self="close()">
      <slot></slot>
    </div>
  </teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  visibility: boolean;
}>();

const emit = defineEmits(['close']);

function close() {
  emit('close');
}
</script>

<style>
#backdrop {
  position: fixed;
  display: flex;
  justify-content: center;
  align-items: center;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
