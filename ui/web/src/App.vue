<template>
  <Transition
    mode="out-in"
    name="skin-fade"
  >
    <component
      :is="currentSkinLayout"
      :key="activeSkinId"
    />
  </Transition>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

import { useSkin } from '@/shared/composables/useSkin.js'

const { activeSkinId } = useSkin()

const skinLayoutMap = {
  classic: defineAsyncComponent(
    async () => import('@/skins/classic/ClassicLayout.vue')
  ),
  modern: defineAsyncComponent(
    async () => import('@/skins/modern/ModernLayout.vue')
  ),
} as const

const currentSkinLayout = computed(
  () =>
    skinLayoutMap[activeSkinId.value as keyof typeof skinLayoutMap] ??
    skinLayoutMap.classic
)
</script>

<style scoped>
.skin-fade-enter-active,
.skin-fade-leave-active {
  transition: opacity 0.2s ease;
}

.skin-fade-enter-from,
.skin-fade-leave-to {
  opacity: 0;
}
</style>
