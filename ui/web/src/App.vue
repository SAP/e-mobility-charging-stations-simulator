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
import { computed, defineAsyncComponent, markRaw } from 'vue'

import SkinLoadError from '@/shared/components/SkinLoadError.vue'
import SkinLoading from '@/shared/components/SkinLoading.vue'
import { useSkin } from '@/shared/composables/useSkin.js'
import { skins } from '@/shared/skins/registry.js'

const { activeSkinId } = useSkin()

const skinLayoutMap = new Map(
  skins.map(s => [
    s.id,
    markRaw(
      defineAsyncComponent({
        delay: 200,
        errorComponent: SkinLoadError,
        loader: async () => {
          await s.loadStyles()
          return s.loadLayout()
        },
        loadingComponent: SkinLoading,
        timeout: 10000,
      })
    ),
  ])
)

const currentSkinLayout = computed(
  () => skinLayoutMap.get(activeSkinId.value) ?? skinLayoutMap.values().next().value
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
