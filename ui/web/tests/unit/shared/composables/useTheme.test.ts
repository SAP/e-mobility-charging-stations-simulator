/**
 * @file Tests for useTheme composable
 * @description Tests for the useTheme shared composable.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useTheme } from '@/shared/composables/useTheme.js'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    const { switchTheme } = useTheme()
    switchTheme('tokyo-night-storm')
  })

  it('should return activeThemeId ref', () => {
    const { activeThemeId } = useTheme()
    expect(activeThemeId.value).toBe('tokyo-night-storm')
  })

  it('should return availableThemes with 8 entries', () => {
    const { availableThemes } = useTheme()
    expect(availableThemes.length).toBe(8)
    expect(availableThemes).toContain('tokyo-night-storm')
    expect(availableThemes).toContain('catppuccin-latte')
    expect(availableThemes).toContain('dracula')
    expect(availableThemes).toContain('gruvbox-dark')
    expect(availableThemes).toContain('rose-pine')
    expect(availableThemes).toContain('teal-dark')
    expect(availableThemes).toContain('teal-light')
    expect(availableThemes).toContain('sap-horizon')
  })

  it('should return switchTheme function', () => {
    const { switchTheme } = useTheme()
    expect(typeof switchTheme).toBe('function')
    expect(switchTheme.length).toBe(1)
  })

  it('should update document data-theme attribute', () => {
    const { switchTheme } = useTheme()
    switchTheme('catppuccin-latte')
    expect(document.documentElement.getAttribute('data-theme')).toBe('catppuccin-latte')
  })

  it('should persist the active theme to localStorage', () => {
    const { switchTheme } = useTheme()
    switchTheme('sap-horizon')
    expect(localStorage.getItem('ecs-ui-theme')).toBe('"sap-horizon"')
  })

  it('should update activeThemeId ref', () => {
    const { activeThemeId, switchTheme } = useTheme()
    switchTheme('catppuccin-latte')
    expect(activeThemeId.value).toBe('catppuccin-latte')
  })

  it('should not set colorScheme inline style (CSS handles it)', () => {
    const { switchTheme } = useTheme()
    switchTheme('tokyo-night-storm')
    expect(document.documentElement.style.colorScheme).toBe('')
    switchTheme('catppuccin-latte')
    expect(document.documentElement.style.colorScheme).toBe('')
    switchTheme('sap-horizon')
    expect(document.documentElement.style.colorScheme).toBe('')
  })

  it('should ignore invalid theme name', () => {
    const { activeThemeId, switchTheme } = useTheme()
    const before = activeThemeId.value
    const switchThemeUntyped = switchTheme as (name: string) => void
    switchThemeUntyped('nonexistent')
    expect(activeThemeId.value).toBe(before)
  })

  it('should fall back to default for invalid localStorage theme value', () => {
    localStorage.setItem('ecs-ui-theme', '"invalid-theme-name"')
    const { activeThemeId, availableThemes } = useTheme()
    expect(availableThemes).toContain(activeThemeId.value)
  })

  describe('SSR environment', () => {
    const originalDocument = globalThis.document

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it('should not throw when document is undefined', () => {
      // @ts-expect-error simulating SSR environment
      globalThis.document = undefined
      const { switchTheme } = useTheme()
      expect(() => {
        switchTheme('catppuccin-latte')
      }).not.toThrow()
      globalThis.document = originalDocument
      const { activeThemeId } = useTheme()
      expect(activeThemeId.value).toBe('catppuccin-latte')
    })
  })
})
