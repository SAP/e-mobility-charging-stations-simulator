import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/composables/Utils.js'
import { DEFAULT_SKIN, type SkinDefinition, skins } from '@/shared/skins/registry.js'

export const SKIN_STORAGE_KEY = 'ecs-ui-skin'

/**
 * Returns a registered skin id or falls back to the default skin.
 * @param skinId - The skin identifier to validate
 * @returns A valid registered skin identifier
 */
function getValidSkinId (skinId: string): string {
  return skins.some(s => s.id === skinId) ? skinId : DEFAULT_SKIN
}

const activeSkinId: Ref<string> = ref(
  getValidSkinId(getFromLocalStorage<string>(SKIN_STORAGE_KEY, DEFAULT_SKIN))
)
const loadedSkins = new Set<string>()
const switching = ref(false)
const lastError: Ref<string | null> = ref(null)

// Eagerly load the initial skin styles.
loadSkinStyles(activeSkinId.value).catch(() => undefined)

/**
 * Returns the active skin id, available skins, and a function to switch skins at runtime.
 * @returns Skin state and switcher
 */
export function useSkin (): {
  activeSkinId: Readonly<Ref<string>>
  lastError: Readonly<Ref<string | null>>
  skins: readonly SkinDefinition[]
  switchSkin: (id: string) => Promise<boolean>
  switching: Readonly<Ref<boolean>>
} {
  /**
   * Switches the active skin and lazy-loads its CSS if needed.
   * @param skinId - The skin identifier to switch to
   * @returns `true` if the skin was successfully switched, `false` otherwise
   */
  async function switchSkin (skinId: string): Promise<boolean> {
    if (switching.value) return false
    const skin = skins.find(s => s.id === skinId)
    if (skin == null || skinId === activeSkinId.value) {
      return false
    }
    switching.value = true
    try {
      await loadSkinStyles(skinId)
      activeSkinId.value = skinId
      setToLocalStorage<string>(SKIN_STORAGE_KEY, skinId)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[useSkin] Failed to load CSS for skin '${skinId}':`, message)
      lastError.value = message
      return false
    } finally {
      switching.value = false
    }
  }

  return {
    activeSkinId: readonly(activeSkinId),
    lastError: readonly(lastError),
    skins,
    switchSkin,
    switching: readonly(switching),
  }
}

/**
 * Loads the CSS file for a skin if not already loaded.
 * @param skinId - The skin identifier to load styles for
 */
async function loadSkinStyles (skinId: string): Promise<void> {
  if (loadedSkins.has(skinId)) {
    return
  }
  const skin = skins.find(s => s.id === skinId)
  if (skin == null) {
    return
  }
  await skin.loadStyles()
  loadedSkins.add(skinId)
}
