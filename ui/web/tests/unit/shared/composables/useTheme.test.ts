/**
 * @file useTheme.test.ts
 * @description Tests for the useTheme shared composable.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useTheme } from '@/shared/composables/useTheme.js'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('should return activeTheme ref', () => {
    const { activeTheme } = useTheme()
    expect(typeof activeTheme.value).toBe('string')
    expect(activeTheme.value.length).toBeGreaterThan(0)
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
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('tokyo-night-storm')
  })

  it('should persist the active theme to localStorage', () => {
    const { setTheme } = useTheme()
    setTheme('sap-horizon')
    expect(localStorage.getItem('ecs-ui-theme')).toBe('"sap-horizon"')
    expect(localStorage.getItem('ecs-ui-theme')).not.toBeNull()
  })

  it('should update activeTheme ref', () => {
    const { activeTheme, setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(activeTheme.value).toBe('catppuccin-latte')
    expect(activeTheme.value).not.toBe('tokyo-night-storm')
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
    const { activeTheme, setTheme } = useTheme()
    const before = activeTheme.value
    const setThemeUntyped = setTheme as (name: string) => void
    setThemeUntyped('nonexistent')
    expect(activeTheme.value).toBe(before)
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('nonexistent')
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
      const { activeTheme } = useTheme()
      expect(activeTheme.value).toBe('catppuccin-latte')
    })
  })
})
