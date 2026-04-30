import { THEME_IDS } from 'ui-common'
import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/core/index.js'
import { validateTokenContract } from '@/shared/tokens/contract.js'

export const AVAILABLE_THEMES = THEME_IDS
export const DEFAULT_THEME: ThemeName = 'tokyo-night-storm'
export const THEME_STORAGE_KEY = 'ecs-ui-theme'

export type ThemeName = (typeof THEME_IDS)[number]

/**
 * Checks whether a string is a valid theme name.
 * @param name - The theme name to validate
 * @returns Whether the name is a valid theme name
 */
function isValidTheme (name: string): name is ThemeName {
  return (AVAILABLE_THEMES as readonly string[]).includes(name)
}

const activeThemeId: Ref<ThemeName> = ref(
  (() => {
    const stored = getFromLocalStorage<string>(THEME_STORAGE_KEY, DEFAULT_THEME)
    return isValidTheme(stored) ? stored : DEFAULT_THEME
  })()
)

const lastError: Ref<null | string> = ref(null)

/**
 * Applies a theme by setting the data-theme attribute on the document root.
 * Disables CSS transitions during the swap to prevent color flash (VueUse pattern).
 * The color-scheme is handled by CSS [data-theme] declarations.
 * @param themeName - The theme name to apply
 */
function applyTheme (themeName: ThemeName): void {
  if (typeof document === 'undefined') return
  // Disable CSS transitions during theme swap to prevent color flash (VueUse pattern).
  document.documentElement.classList.add('theme-switching')
  document.documentElement.setAttribute('data-theme', themeName)
  // Force reflow so browsers apply the transition-disable before restoring transitions.
  // eslint-disable-next-line no-void
  void document.documentElement.offsetHeight
  document.documentElement.classList.remove('theme-switching')
}

applyTheme(activeThemeId.value)

/**
 * Returns the active theme, available themes, and a function to switch themes at runtime.
 * @returns Theme state and switcher
 */
export function useTheme (): {
  activeThemeId: Readonly<Ref<ThemeName>>
  availableThemes: typeof AVAILABLE_THEMES
  lastError: Readonly<Ref<null | string>>
  switchTheme: (name: string) => void
} {
  /**
   * Switches the active theme, updates the DOM, and persists the preference.
   * @param name - The theme name to activate
   */
  function switchTheme (name: string): void {
    if (!isValidTheme(name)) {
      lastError.value = `Invalid theme: '${name}'`
      return
    }
    lastError.value = null
    applyTheme(name)
    activeThemeId.value = name
    setToLocalStorage<string>(THEME_STORAGE_KEY, name)
    validateTokenContract('useTheme', name)
  }

  return {
    activeThemeId: readonly(activeThemeId),
    availableThemes: AVAILABLE_THEMES,
    lastError: readonly(lastError),
    switchTheme,
  }
}
