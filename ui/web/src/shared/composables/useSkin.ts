import { type SKIN_IDS } from 'ui-common'
import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/core/index.js'
import { validateTokenContract } from '@/shared/tokens/contract.js'
// Intentional: registry.ts is pure metadata (ids, labels, loaders) — no behavioral coupling.
import { DEFAULT_SKIN, type SkinDefinition, skins } from '@/skins/registry.js'

export const SKIN_STORAGE_KEY = 'ecs-ui-skin'

export type SkinName = (typeof SKIN_IDS)[number]

/**
 * Checks whether a string is a valid registered skin id.
 * @param skinId - The skin identifier to validate
 * @returns Whether the id is a registered skin identifier
 */
function isValidSkin (skinId: string): skinId is SkinName {
  return skins.some(s => s.id === skinId)
}

/**
 * Singleton state — shared across all useSkin() consumers (global skin config).
 * Uses `isSwitching` (not `pending`) because this tracks a UI-visible CSS transition,
 * not merely a pending network request.
 */
const activeSkinId: Ref<SkinName> = ref(
  (() => {
    const stored = getFromLocalStorage<string>(SKIN_STORAGE_KEY, DEFAULT_SKIN)
    return isValidSkin(stored) ? stored : DEFAULT_SKIN
  })()
)
// JS/testing hook — no CSS uses [data-skin]; skin isolation is via component class scoping.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-skin', activeSkinId.value)
}
const loadedSkins = new Set<string>()
let switchPromise: null | Promise<boolean> = null
const lastError: Ref<null | string> = ref(null)

/** Whether a skin switch is currently in progress (CSS transition-dependent). */
const isSwitching: Ref<boolean> = ref(false)

/**
 * Returns the active skin id, available skins, and a function to switch skins at runtime.
 * @returns Skin state and switcher
 */
export function useSkin (): {
  activeSkinId: Readonly<Ref<SkinName>>
  availableSkins: readonly SkinDefinition[]
  isSwitching: Readonly<Ref<boolean>>
  lastError: Readonly<Ref<null | string>>
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
    availableSkins: skins,
    isSwitching: readonly(isSwitching),
    lastError: readonly(lastError),
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
  validateTokenContract('useSkin', skinId)
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
    activeSkinId.value = skinId as SkinName
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-skin', skinId)
      document.body.style.overflow = ''
    }
    setToLocalStorage<string>(SKIN_STORAGE_KEY, skinId)
    try {
      sessionStorage.removeItem('skin-error-reload-count')
    } catch {
      /* sessionStorage unavailable */
    }
    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[useSkin] Failed to load CSS for skin '${skinId}':`, message)
    lastError.value = message
    return false
  } finally {
    isSwitching.value = false
  }
}
