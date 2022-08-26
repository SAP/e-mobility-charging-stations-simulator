<template>
  <Modal :visibility="props.visibility">
    <label for="idTag">IdTag</label>
    <!-- eslint-disable-next-line vue/no-mutating-props -->
    <input type="text" name="idTag" v-model="props.idTag" @keypress.enter="done()" />
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
  idTag: string;
}>();

const emit = defineEmits(['done']);

function done() {
  emit('done');
}
</script>
