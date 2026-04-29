import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/composables/Utils.js'

export const AVAILABLE_THEMES = ['catppuccin-latte', 'sap-horizon', 'tokyo-night-storm'] as const
export const DEFAULT_THEME = 'tokyo-night-storm'
export const THEME_STORAGE_KEY = 'ecs-ui-theme'

export type ThemeName = (typeof AVAILABLE_THEMES)[number]

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

/**
 * Applies a theme by setting the data-theme attribute on the document root.
 * Disables CSS transitions during the swap to prevent color flash (VueUse pattern).
 * The color-scheme is handled by CSS [data-theme] declarations.
 * @param themeName - The theme name to apply
 */
function applyTheme (themeName: ThemeName): void {
  if (typeof document === 'undefined') return
  // Disable CSS transitions during theme swap to prevent color flash (VueUse pattern).
  const style = document.createElement('style')
  style.textContent =
    '*, *::before, *::after { transition: none !important; animation: none !important; }'
  document.head.appendChild(style)
  document.documentElement.setAttribute('data-theme', themeName)
  // Force reflow so browsers apply the transition-disable before restoring transitions.
  // eslint-disable-next-line no-void
  void document.documentElement.offsetHeight
  document.head.removeChild(style)
}

// Apply initial theme at module initialization
applyTheme(activeThemeId.value)

/**
 * Returns the active theme, available themes, and a function to switch themes at runtime.
 * @returns Theme state and switcher
 */
export function useTheme (): {
  activeThemeId: Readonly<Ref<ThemeName>>
  availableThemes: typeof AVAILABLE_THEMES
  setTheme: (name: string) => void
} {
  /**
   * Switches the active theme, updates the DOM, and persists the preference.
   * @param name - The theme name to activate
   */
  function setTheme (name: string): void {
    if (!isValidTheme(name)) {
      return
    }
    applyTheme(name)
    activeThemeId.value = name
    setToLocalStorage<string>(THEME_STORAGE_KEY, name)
  }

  return {
    activeThemeId: readonly(activeThemeId),
    availableThemes: AVAILABLE_THEMES,
    setTheme,
  }
}
