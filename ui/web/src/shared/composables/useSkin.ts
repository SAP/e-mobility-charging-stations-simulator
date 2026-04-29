import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/composables/Utils.js'
import { DEFAULT_SKIN, type SkinDefinition, skins } from '@/shared/skins/registry.js'
import { TOKEN_CONTRACT } from '@/shared/tokens/contract.js'

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
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-skin', activeSkinId.value)
}
const loadedSkins = new Set<string>()
const switching = ref(false)
const lastError: Ref<null | string> = ref(null)

/**
 * Returns the active skin id, available skins, and a function to switch skins at runtime.
 * @returns Skin state and switcher
 */
export function useSkin (): {
  activeSkinId: Readonly<Ref<string>>
  lastError: Readonly<Ref<null | string>>
  skins: readonly SkinDefinition[]
  switching: Readonly<Ref<boolean>>
  switchSkin: (id: string) => Promise<boolean>
} {
  /**
   * Switches the active skin and lazy-loads its CSS if needed.
   * @param skinId - The skin identifier to switch to
   * @returns `true` if the skin was successfully switched, `false` otherwise
   */
  async function switchSkin (skinId: string): Promise<boolean> {
    if (switching.value) return false
    const skin = skins.find(s => s.id === skinId)
    if (skin == null) {
      return false
    }
    if (skinId === activeSkinId.value) {
      // Ensure styles are loaded even if skin is already active (idempotent success)
      await loadSkinStyles(skinId)
      return true
    }
    switching.value = true
    try {
      await loadSkinStyles(skinId)
      lastError.value = null
      activeSkinId.value = skinId
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-skin', skinId)
      }
      setToLocalStorage<string>(SKIN_STORAGE_KEY, skinId)
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('skin-error-reload-count')
      }
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
    switching: readonly(switching),
    switchSkin,
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
  validateTokenContract(skinId)
}

/**
 * Dev-mode runtime check that all required CSS custom properties are defined.
 * @param skinId - The skin identifier that was just loaded
 */
function validateTokenContract (skinId: string): void {
  if (!import.meta.env.DEV || typeof document === 'undefined') return
  const style = getComputedStyle(document.documentElement)
  for (const prop of Object.values(TOKEN_CONTRACT)) {
    if (!style.getPropertyValue(prop).trim()) {
      console.warn(`[useSkin] Missing CSS token '${prop}' after loading skin '${skinId}'`)
    }
  }
}
