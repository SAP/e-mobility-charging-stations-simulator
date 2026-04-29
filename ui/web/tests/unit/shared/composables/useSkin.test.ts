/**
 * @file useSkin.test.ts
 * @description Tests for the useSkin shared composable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSkin } from '@/shared/composables/useSkin.js'
import { DEFAULT_SKIN, skins } from '@/shared/skins/registry.js'

vi.mock('@/shared/skins/registry.js', () => ({
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

  it('should return activeSkinId defaulting to DEFAULT_SKIN', () => {
    const { activeSkinId } = useSkin()
    expect(activeSkinId.value).toBe(DEFAULT_SKIN)
    expect(typeof activeSkinId.value).toBe('string')
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

  it('should switchSkin does not update activeSkinId when loadStyles rejects', async () => {
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

  it('should switchSkin guards against concurrent calls', async () => {
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

  it('should switchSkin skips loadStyles when skin is already active', async () => {
    const classicSkin = skins.find(s => s.id === 'classic')
    expect(classicSkin).toBeDefined()
    if (classicSkin == null) return
    vi.mocked(classicSkin.loadStyles).mockClear()
    const { activeSkinId, switchSkin } = useSkin()
    await switchSkin('classic')
    expect(classicSkin.loadStyles).not.toHaveBeenCalled()
    expect(activeSkinId.value).toBe('classic')
  })

  it('should switchSkin updates activeSkinId', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    await switchSkin('modern')
    expect(activeSkinId.value).toBe('modern')
    expect(activeSkinId.value).not.toBe('classic')
  })

  it('should switchSkin persists to localStorage', async () => {
    const { switchSkin } = useSkin()
    await switchSkin('modern')
    expect(localStorage.getItem('ecs-ui-skin')).toBe('"modern"')
    expect(localStorage.getItem('ecs-ui-skin')).not.toBeNull()
  })

  it('should switchSkin ignores invalid skin id', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const before = activeSkinId.value
    await switchSkin('nonexistent')
    expect(activeSkinId.value).toBe(before)
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })

  it('should switchSkin ignores current skin id', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const before = activeSkinId.value
    await switchSkin(before)
    expect(activeSkinId.value).toBe(before)
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })
})
