<template>
  <Modal :visibility="visibility">
    <label for="tag">Tags</label>
    <!-- eslint-disable-next-line -->
    <input type="text" name="tag" v-model="tag" @keypress.enter="done()" />
    <Button @click="done()">
      <slot></slot>
    </Button>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal.vue';
import Button from '../buttons/Button.vue';

const props = defineProps<{
  visibility: boolean;
  tag: string;
}>();

const emit = defineEmits(['done']);

function done() {
  emit('done');
}
</script>
