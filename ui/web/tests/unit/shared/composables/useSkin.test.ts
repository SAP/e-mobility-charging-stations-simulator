/**
 * @file Tests for useSkin composable
 * @description Tests for the useSkin shared composable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSkin } from '@/shared/composables/useSkin.js'
import { DEFAULT_SKIN, skins } from '@/skins/registry.js'

vi.mock('@/skins/registry.js', () => ({
  DEFAULT_SKIN: 'classic',
  skins: [
    {
      description: 'Table-based layout with a sticky sidebar action panel.',
      id: 'classic',
      label: 'Classic',
      loadStyles: vi.fn().mockResolvedValue(undefined),
    },
    {
      description: 'Responsive card grid with modal dialogs.',
      id: 'modern',
      label: 'Modern',
      loadStyles: vi.fn().mockResolvedValue(undefined),
    },
  ],
}))

describe('useSkin', () => {
  beforeEach(async () => {
    // Reset module-level singleton state to default
    const { activeSkinId, switchSkin } = useSkin()
    if (activeSkinId.value !== 'classic') {
      await switchSkin('classic')
    }
    localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
    document.documentElement.removeAttribute('data-theme')
  })

  it('should return activeSkinId defaulting to DEFAULT_SKIN', () => {
    const { activeSkinId } = useSkin()
    expect(activeSkinId.value).toBe(DEFAULT_SKIN)
  })

  it('should return skins array with 2 entries', () => {
    const { skins: skinsList } = useSkin()
    expect(skinsList.length).toBe(2)
    expect(skinsList.map(s => s.id)).toEqual(['classic', 'modern'])
  })

  it('should return switchSkin function', () => {
    const { switchSkin } = useSkin()
    expect(typeof switchSkin).toBe('function')
  })

  it('should not update activeSkinId when loadStyles rejects', async () => {
    const modernSkin = skins.find(s => s.id === 'modern')
    expect(modernSkin).toBeDefined()
    if (modernSkin == null) return
    vi.mocked(modernSkin.loadStyles).mockRejectedValueOnce(new Error('CSS not found'))
    const { activeSkinId, switchSkin } = useSkin()
    const result = await switchSkin('modern')
    expect(result).toBe(false)
    expect(activeSkinId.value).toBe('classic')
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })

  it('should populate lastError on skin load failure', async () => {
    const modernSkin = skins.find(s => s.id === 'modern')
    expect(modernSkin).toBeDefined()
    if (modernSkin == null) return
    vi.mocked(modernSkin.loadStyles).mockRejectedValueOnce(new Error('Network error'))
    const { lastError, switchSkin } = useSkin()
    await switchSkin('modern')
    expect(lastError.value).toBe('Network error')
  })

  it('should set isSwitching to true during async load', async () => {
    const modernSkin = skins.find(s => s.id === 'modern')
    expect(modernSkin).toBeDefined()
    if (modernSkin == null) return
    vi.mocked(modernSkin.loadStyles).mockClear()
    let rejectLoad!: (err: Error) => void
    vi.mocked(modernSkin.loadStyles).mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectLoad = reject
        })
    )
    const { isSwitching, switchSkin } = useSkin()
    const promise = switchSkin('modern')
    expect(isSwitching.value).toBe(true)
    rejectLoad(new Error('test cleanup'))
    await promise
    expect(isSwitching.value).toBe(false)
  })

  it('should guard against concurrent switchSkin calls', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const modernSkin = skins.find(s => s.id === 'modern')
    expect(modernSkin).toBeDefined()
    if (modernSkin == null) return
    vi.mocked(modernSkin.loadStyles).mockClear()
    let resolveLoad!: () => void
    vi.mocked(modernSkin.loadStyles).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve
        })
    )
    const first = switchSkin('modern')
    const second = switchSkin('modern')
    expect(activeSkinId.value).toBe('classic')
    resolveLoad()
    await first
    await second
    expect(activeSkinId.value).toBe('modern')
    expect(modernSkin.loadStyles).toHaveBeenCalledTimes(1)
  })

  it('should skip loadStyles when the skin is already active', async () => {
    const classicSkin = skins.find(s => s.id === 'classic')
    expect(classicSkin).toBeDefined()
    if (classicSkin == null) return
    vi.mocked(classicSkin.loadStyles).mockClear()
    const { activeSkinId, switchSkin } = useSkin()
    await switchSkin('classic')
    expect(classicSkin.loadStyles).not.toHaveBeenCalled()
    expect(activeSkinId.value).toBe('classic')
  })

  it('should update activeSkinId on successful skin switch', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    await switchSkin('modern')
    expect(activeSkinId.value).toBe('modern')
  })

  it('should persist the active skin to localStorage', async () => {
    const { switchSkin } = useSkin()
    await switchSkin('modern')
    expect(localStorage.getItem('ecs-ui-skin')).toBe('"modern"')
  })

  it('should ignore invalid skin id', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const before = activeSkinId.value
    await switchSkin('nonexistent')
    expect(activeSkinId.value).toBe(before)
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })

  it('should return true without reload when switching to already-active skin', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const before = activeSkinId.value
    const result = await switchSkin(before)
    expect(result).toBe(true)
    expect(activeSkinId.value).toBe(before)
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })

  it('should return the singleton activeSkinId regardless of later localStorage writes', () => {
    localStorage.setItem('ecs-ui-skin', '"modern"')
    const { activeSkinId } = useSkin()
    expect(activeSkinId.value).toBe('classic')
  })

  it('should set data-skin attribute on document element after switch', async () => {
    const { switchSkin } = useSkin()
    await switchSkin('modern')
    expect(document.documentElement.getAttribute('data-skin')).toBe('modern')
  })

  it('should handle corrupted localStorage value gracefully', () => {
    // Manually set a non-JSON value
    localStorage.setItem('ecs-ui-skin', 'not-valid-json{')
    // Re-call useSkin — the singleton already initialized, so this tests
    // the getFromLocalStorage fallback path
    const { activeSkinId } = useSkin()
    expect(activeSkinId.value).toBe('classic')
  })

  it('should remove skin-error-reload-count from sessionStorage on successful switch', async () => {
    sessionStorage.setItem('skin-error-reload-count', '2')
    const { switchSkin } = useSkin()
    await switchSkin('modern')
    expect(sessionStorage.getItem('skin-error-reload-count')).toBeNull()
  })

  it('should remove skin-error-reload-count from sessionStorage when switching to already-active skin', async () => {
    sessionStorage.setItem('skin-error-reload-count', '1')
    const { activeSkinId, switchSkin } = useSkin()
    await switchSkin(activeSkinId.value)
    expect(sessionStorage.getItem('skin-error-reload-count')).toBeNull()
  })
})
