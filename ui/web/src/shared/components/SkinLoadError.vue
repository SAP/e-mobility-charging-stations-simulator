<template>
  <div class="skin-load-error">
    <p>Failed to load skin layout.</p>
    <button @click="$emit('retry')">
      Retry
    </button>
    <button @click="resetToDefault">
      Switch to {{ defaultSkinLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { setToLocalStorage } from '@/composables/Utils.js'
import { SKIN_STORAGE_KEY } from '@/shared/composables/useSkin.js'
import { DEFAULT_SKIN, skins } from '@/skins/registry.js'

defineEmits<{ retry: [] }>()

const defaultSkinLabel = skins.find(s => s.id === DEFAULT_SKIN)?.label ?? 'Default'

/**
 * Resets to default skin with reload loop protection.
 * NOTE: Successful skin loads (e.g. in useSkin.switchSkin) should clear
 * the 'skin-error-reload-count' sessionStorage key to reset the counter.
 */
function resetToDefault (): void {
  const RELOAD_KEY = 'skin-error-reload-count'
  let count = 0
  try {
    count = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0')
  } catch {
    // sessionStorage unavailable (e.g. Safari private browsing)
  }
  if (count >= 2) {
    // Stop infinite reload loop — show message instead
    return
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, String(count + 1))
  } catch {
    // sessionStorage unavailable — proceed with reset anyway
  }
  setToLocalStorage<string>(SKIN_STORAGE_KEY, DEFAULT_SKIN)
  window.location.reload()
}
</script>

<style scoped>
.skin-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 50vh;
  padding: 2rem;
  color: var(--color-text, #e0e0e0);
  font-family: system-ui, sans-serif;
}

.skin-load-error button {
  padding: 0.5rem 1.25rem;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.875rem;
}

.skin-load-error button:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
