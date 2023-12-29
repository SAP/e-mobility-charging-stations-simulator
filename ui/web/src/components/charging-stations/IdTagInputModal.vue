<template>
  <Modal :visibility="props.visibility">
    <label for="idTag">IdTag</label>
    <!-- eslint-disable-next-line vue/no-mutating-props -->
    <input v-model="props.idTag" type="text" name="idTag" @keypress.enter="done()" />
    <Button @click="done()">
      <slot></slot>
    </Button>
  </Modal>
</template>

<script setup lang="ts">
import Button from '../buttons/Button.vue'
import Modal from '@/components/Modal.vue'

const props = defineProps<{
  visibility: boolean
  idTag: string
}>()

const emit = defineEmits(['done'])

function done() {
  emit('done')
}
</script>
