import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/composables/Utils.js'
import { TOKEN_CONTRACT } from '@/shared/tokens/contract.js'
// NOTE: Intentional dependency on skins/registry (pure metadata, no component logic).
// This creates a shared → skins coupling, but registry.ts contains only static
// skin metadata (ids, labels, lazy loaders) — no circular or behavioral dependency.
import { DEFAULT_SKIN, type SkinDefinition, skins } from '@/skins/registry.js'

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
// Set data-skin attribute on module load for programmatic skin identification.
// NOTE: No CSS currently uses [data-skin] selectors — skin isolation relies on component-level
// class scoping (.modern-app, .classic-layout). This attribute serves as a JS/testing hook.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-skin', activeSkinId.value)
}
const loadedSkins = new Set<string>()
let switchPromise: null | Promise<boolean> = null
const lastError: Ref<null | string> = ref(null)

/** Whether a skin switch is currently in progress. */
const isSwitching: Ref<boolean> = ref(false)

/**
 * Returns the active skin id, available skins, and a function to switch skins at runtime.
 * @returns Skin state and switcher
 */
export function useSkin (): {
  activeSkinId: Readonly<Ref<string>>
  isSwitching: Readonly<Ref<boolean>>
  lastError: Readonly<Ref<null | string>>
  skins: readonly SkinDefinition[]
  switchSkin: (id: string) => Promise<boolean>
} {
  /**
   * Switches the active skin and lazy-loads its CSS if needed.
   * Uses Promise coalescing to prevent concurrent skin switches.
   * @param skinId - The skin identifier to switch to
   * @returns `true` if the skin was successfully switched, `false` otherwise
   */
  async function switchSkin (skinId: string): Promise<boolean> {
    if (switchPromise != null) {
      await switchPromise
      if (activeSkinId.value === skinId) return true
    }
    switchPromise = performSkinSwitch(skinId).finally(() => {
      switchPromise = null
    })
    return switchPromise
  }

  return {
    activeSkinId: readonly(activeSkinId),
    isSwitching: readonly(isSwitching),
    lastError: readonly(lastError),
    skins,
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
 * Performs the actual skin switch logic.
 * @param skinId - The skin identifier to switch to
 * @returns `true` if the skin was successfully switched, `false` otherwise
 */
async function performSkinSwitch (skinId: string): Promise<boolean> {
  const skin = skins.find(s => s.id === skinId)
  if (skin == null) {
    return false
  }
  isSwitching.value = true
  if (skinId === activeSkinId.value) {
    try {
      await loadSkinStyles(skinId)
      try {
        sessionStorage.removeItem('skin-error-reload-count')
      } catch {
        /* sessionStorage unavailable */
      }
      return true
    } finally {
      isSwitching.value = false
    }
  }
  try {
    await loadSkinStyles(skinId)
    lastError.value = null
    activeSkinId.value = skinId
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-skin', skinId)
    }
    setToLocalStorage<string>(SKIN_STORAGE_KEY, skinId)
    try {
      sessionStorage.removeItem('skin-error-reload-count')
    } catch {
      /* sessionStorage unavailable */
    }
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[useSkin] Failed to load CSS for skin '${skinId}':`, message)
    lastError.value = message
    return false
  } finally {
    isSwitching.value = false
  }
}

/**
 * Dev-mode runtime check that all required CSS custom properties are defined.
 * @param skinId - The skin identifier that was just loaded
 */
function validateTokenContract (skinId: string): void {
  if (!import.meta.env.DEV || typeof document === 'undefined') return
  const style = getComputedStyle(document.documentElement)
  for (const token of TOKEN_CONTRACT) {
    const prop = `--${token}`
    if (!style.getPropertyValue(prop).trim()) {
      console.warn(`[useSkin] Missing CSS token '${prop}' after loading skin '${skinId}'`)
    }
  }
}
