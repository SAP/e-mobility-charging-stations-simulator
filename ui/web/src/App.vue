<template>
  <Transition
    mode="out-in"
    name="skin-fade"
  >
    <component
      :is="activeSkinLayout"
      v-if="activeSkinLayout"
      :key="activeSkinId"
    />
    <div
      v-else
      class="skin-fallback"
    >
      <p>Unable to load skin layout. Please reload the page.</p>
      <button @click="reloadPage">
        Reload
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, watch } from 'vue'

import SkinLoadError from '@/shared/components/SkinLoadError.vue'
import SkinLoading from '@/shared/components/SkinLoading.vue'
import { useSkin } from '@/shared/composables/useSkin.js'
import { skins } from '@/skins/registry.js'

const { activeSkinId } = useSkin()

watch(activeSkinId, () => {
  document.body.style.overflow = ''
})

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

const activeSkinLayout = computed(
  () => skinLayoutMap.get(activeSkinId.value) ?? skinLayoutMap.values().next().value
)

/** Reloads the page when skin layout fails to load. */
function reloadPage (): void {
  window.location.reload()
}
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

.skin-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  text-align: center;
  padding: 2rem;
}

.skin-fallback button {
  margin-top: 1rem;
  padding: 0.5rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .skin-fade-enter-active,
  .skin-fade-leave-active {
    transition: none;
  }
}
</style>
