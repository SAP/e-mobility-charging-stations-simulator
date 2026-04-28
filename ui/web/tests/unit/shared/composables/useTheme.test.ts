/**
 * @file useTheme.test.ts
 * @description Tests for the useTheme shared composable.
 */
import { beforeEach, describe, expect, it } from 'vitest'

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
  })

  it('setTheme updates document data-theme attribute', () => {
    const { setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(document.documentElement.getAttribute('data-theme')).toBe('catppuccin-latte')
  })

  it('setTheme persists to localStorage', () => {
    const { setTheme } = useTheme()
    setTheme('sap-horizon')
    expect(localStorage.getItem('ecs-ui-theme')).toBe('"sap-horizon"')
  })

  it('setTheme updates activeTheme ref', () => {
    const { activeTheme, setTheme } = useTheme()
    setTheme('catppuccin-latte')
    expect(activeTheme.value).toBe('catppuccin-latte')
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
})
