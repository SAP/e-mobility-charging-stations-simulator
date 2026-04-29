<template>
  <Modal
    :title="title"
    @close="$emit('cancel')"
  >
    <p class="modern-dialog__message">
      {{ message }}
    </p>
    <template #footer>
      <ActionButton
        variant="ghost"
        @click="$emit('cancel')"
      >
        {{ cancelLabel }}
      </ActionButton>
      <ActionButton
        :variant="variant"
        :pending="pending"
        @click="$emit('confirm')"
      >
        {{ confirmLabel }}
      </ActionButton>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import ActionButton from './ActionButton.vue'
import Modal from './Modal.vue'

withDefaults(
  defineProps<{
    cancelLabel?: string
    confirmLabel?: string
    message: string
    pending?: boolean
    title: string
    variant?: 'danger' | 'primary'
  }>(),
  {
    cancelLabel: 'Cancel',
    confirmLabel: 'Confirm',
    pending: false,
    variant: 'danger',
  }
)

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>
