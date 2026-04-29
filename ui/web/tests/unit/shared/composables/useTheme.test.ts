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
    const { setTheme } = useTheme()
    setTheme('tokyo-night-storm')
  })

  it('should return activeThemeId ref', () => {
    const { activeThemeId } = useTheme()
    expect(activeThemeId.value).toBe('tokyo-night-storm')
  })

  it('should return availableThemes with 3 entries', () => {
    const { availableThemes } = useTheme()
    expect(availableThemes.length).toBe(3)
    expect(availableThemes).toContain('tokyo-night-storm')
    expect(availableThemes).toContain('catppuccin-latte')
    expect(availableThemes).toContain('sap-horizon')
  })

  it('should return setTheme function', () => {
    const { setTheme } = useTheme()
    expect(typeof setTheme).toBe('function')
    expect(setTheme.length).toBe(1)
  })

  it('should update document data-theme attribute', () => {
    const { setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(document.documentElement.getAttribute('data-theme')).toBe('catppuccin-latte')
  })

  it('should persist the active theme to localStorage', () => {
    const { setTheme } = useTheme()
    setTheme('sap-horizon')
    expect(localStorage.getItem('ecs-ui-theme')).toBe('"sap-horizon"')
  })

  it('should update activeThemeId ref', () => {
    const { activeThemeId, setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(activeThemeId.value).toBe('catppuccin-latte')
  })

  it('should not set colorScheme inline style (CSS handles it)', () => {
    const { setTheme } = useTheme()
    setTheme('tokyo-night-storm')
    expect(document.documentElement.style.colorScheme).toBe('')
    setTheme('catppuccin-latte')
    expect(document.documentElement.style.colorScheme).toBe('')
    setTheme('sap-horizon')
    expect(document.documentElement.style.colorScheme).toBe('')
  })

  it('should ignore invalid theme name', () => {
    const { activeThemeId, setTheme } = useTheme()
    const before = activeThemeId.value
    const setThemeUntyped = setTheme as (name: string) => void
    setThemeUntyped('nonexistent')
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
      const { setTheme } = useTheme()
      expect(() => {
        setTheme('catppuccin-latte')
      }).not.toThrow()
      globalThis.document = originalDocument
      const { activeThemeId } = useTheme()
      expect(activeThemeId.value).toBe('catppuccin-latte')
    })
  })
})
