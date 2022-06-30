<template>
  <teleport to="body">
    <div class="modal" v-if="show" @click.self="close()">
      <slot></slot>
    </div>
  </teleport>
</template>

<script setup lang="ts">
  const props = defineProps<{
    show: boolean
  }>();

  const emit = defineEmits(['close']);

  function close() {
    emit('close');
  }
</script>

<style>
.modal {
  position: fixed;
  display: flex;
  justify-content: center;
  align-items: center;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
