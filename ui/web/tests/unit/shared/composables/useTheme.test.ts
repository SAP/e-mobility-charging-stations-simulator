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

  it('returns activeTheme ref', () => {
    const { activeTheme } = useTheme()
    expect(typeof activeTheme.value).toBe('string')
    expect(activeTheme.value.length).toBeGreaterThan(0)
  })

  it('returns availableThemes with 3 entries', () => {
    const { availableThemes } = useTheme()
    expect(availableThemes.length).toBe(3)
    expect(availableThemes).toContain('tokyo-night-storm')
    expect(availableThemes).toContain('catppuccin-latte')
    expect(availableThemes).toContain('sap-horizon')
  })

  it('returns setTheme function', () => {
    const { setTheme } = useTheme()
    expect(typeof setTheme).toBe('function')
    expect(setTheme.length).toBe(1)
  })

  it('setTheme updates document data-theme attribute', () => {
    const { setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(document.documentElement.getAttribute('data-theme')).toBe('catppuccin-latte')
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('tokyo-night-storm')
  })

  it('setTheme persists to localStorage', () => {
    const { setTheme } = useTheme()
    setTheme('sap-horizon')
    expect(localStorage.getItem('ecs-ui-theme')).toBe('"sap-horizon"')
    expect(localStorage.getItem('ecs-ui-theme')).not.toBeNull()
  })

  it('setTheme updates activeTheme ref', () => {
    const { activeTheme, setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(activeTheme.value).toBe('catppuccin-latte')
    expect(activeTheme.value).not.toBe('tokyo-night-storm')
  })

  it('setTheme sets dark color-scheme for tokyo-night-storm', () => {
    const { setTheme } = useTheme()
    setTheme('tokyo-night-storm')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('setTheme sets light color-scheme for catppuccin-latte', () => {
    const { setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('setTheme sets light color-scheme for sap-horizon', () => {
    const { setTheme } = useTheme()
    setTheme('sap-horizon')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('setTheme ignores invalid theme name', () => {
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

    it('applyTheme does not throw when document is undefined', () => {
      // @ts-expect-error simulating SSR environment
      globalThis.document = undefined
      const { setTheme } = useTheme()
      expect(() => { setTheme('catppuccin-latte') }).not.toThrow()
      globalThis.document = originalDocument
      const { activeTheme } = useTheme()
      expect(activeTheme.value).toBe('catppuccin-latte')
    })
  })
})
