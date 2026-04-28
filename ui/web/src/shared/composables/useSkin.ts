import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/composables/Utils.js'
import { DEFAULT_SKIN, type SkinDefinition, skins } from '@/shared/skins/registry.js'

const SKIN_STORAGE_KEY = 'ecs-ui-skin'

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
let switching = false

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

// Eagerly load initial skin styles at module initialization
loadSkinStyles(activeSkinId.value).catch(() => undefined)

/**
 * Returns the active skin id, available skins, and a function to switch skins at runtime.
 * @returns Skin state and switcher
 */
export function useSkin (): {
  activeSkinId: Readonly<Ref<string>>
  skins: readonly SkinDefinition[]
  switchSkin: (id: string) => Promise<void>
} {
  /**
   * Switches the active skin and lazy-loads its CSS if needed.
   * @param skinId - The skin identifier to switch to
   */
  async function switchSkin (skinId: string): Promise<void> {
    if (switching) return
    const skin = skins.find(s => s.id === skinId)
    if (skin == null || skinId === activeSkinId.value) {
      return
    }
    switching = true
    try {
      await loadSkinStyles(skinId)
      activeSkinId.value = skinId
      setToLocalStorage<string>(SKIN_STORAGE_KEY, skinId)
    } finally {
      switching = false
    }
  }

  return {
    activeSkinId: readonly(activeSkinId),
    skins,
    switchSkin,
  }
}
