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

import SkinLoadError from '@/shared/components/SkinLoadError.vue'
import SkinLoading from '@/shared/components/SkinLoading.vue'
import { useSkin } from '@/shared/composables/useSkin.js'
import { skins } from '@/shared/skins/registry.js'

const { activeSkinId } = useSkin()

const currentSkinLayout = computed(() => {
  const skin = skins.find(s => s.id === activeSkinId.value) ?? skins[0]
  return defineAsyncComponent({
    errorComponent: SkinLoadError,
    loadingComponent: SkinLoading,
    loader: skin.loadLayout,
  })
})
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
