import { readonly, ref, type Ref } from 'vue'

import { getFromLocalStorage, setToLocalStorage } from '@/composables/Utils.js'

const AVAILABLE_THEMES = ['catppuccin-latte', 'sap-horizon', 'tokyo-night-storm'] as const
const DEFAULT_THEME = 'tokyo-night-storm'
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

const activeTheme: Ref<ThemeName> = ref(
  (() => {
    const stored = getFromLocalStorage<string>(THEME_STORAGE_KEY, DEFAULT_THEME)
    return isValidTheme(stored) ? stored : DEFAULT_THEME
  })()
)

/**
 * Applies a theme by setting the data-theme attribute and color-scheme on the document root.
 * @param themeName - The theme name to apply
 */
function applyTheme (themeName: ThemeName): void {
  if (typeof document === 'undefined') return
  const isDark = themeName === 'tokyo-night-storm'
  document.documentElement.setAttribute('data-theme', themeName)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

// Apply initial theme at module initialization
applyTheme(activeTheme.value)

/**
 * Returns the active theme, available themes, and a function to switch themes at runtime.
 * @returns Theme state and switcher
 */
export function useTheme (): {
  activeTheme: Readonly<Ref<ThemeName>>
  availableThemes: typeof AVAILABLE_THEMES
  setTheme: (name: ThemeName) => void
} {
  /**
   * Switches the active theme, updates the DOM, and persists the preference.
   * @param name - The theme name to activate
   */
  function setTheme (name: ThemeName): void {
    if (!isValidTheme(name)) {
      return
    }
    applyTheme(name)
    activeTheme.value = name
    setToLocalStorage<string>(THEME_STORAGE_KEY, name)
  }

  return {
    activeTheme: readonly(activeTheme),
    availableThemes: AVAILABLE_THEMES,
    setTheme,
  }
}
