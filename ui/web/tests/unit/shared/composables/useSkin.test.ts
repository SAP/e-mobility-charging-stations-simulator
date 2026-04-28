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
    const { activeSkinId, setSkin } = useSkin()
    if (activeSkinId.value !== 'classic') {
      await setSkin('classic')
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

  it('should return setSkin function', () => {
    const { setSkin } = useSkin()
    expect(typeof setSkin).toBe('function')
  })

  it('should setSkin does not update activeSkinId when loadStyles rejects', async () => {
    const modernSkin = skins.find(s => s.id === 'modern')
    expect(modernSkin).toBeDefined()
    if (modernSkin == null) return
    vi.mocked(modernSkin.loadStyles).mockRejectedValueOnce(new Error('CSS not found'))
    const { activeSkinId, setSkin } = useSkin()
    await expect(setSkin('modern')).rejects.toThrow('CSS not found')
    expect(activeSkinId.value).toBe('classic')
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })

  it('should setSkin guards against concurrent calls', async () => {
    const { activeSkinId, setSkin } = useSkin()
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
    const first = setSkin('modern')
    const second = setSkin('modern')
    expect(activeSkinId.value).toBe('classic')
    resolveLoad()
    await first
    await second
    expect(activeSkinId.value).toBe('modern')
    expect(modernSkin.loadStyles).toHaveBeenCalledTimes(1)
  })

  it('should setSkin skips loadStyles when skin is already active', async () => {
    const classicSkin = skins.find(s => s.id === 'classic')
    expect(classicSkin).toBeDefined()
    if (classicSkin == null) return
    vi.mocked(classicSkin.loadStyles).mockClear()
    const { activeSkinId, setSkin } = useSkin()
    await setSkin('classic')
    expect(classicSkin.loadStyles).not.toHaveBeenCalled()
    expect(activeSkinId.value).toBe('classic')
  })

  it('should setSkin updates activeSkinId', async () => {
    const { activeSkinId, setSkin } = useSkin()
    await setSkin('modern')
    expect(activeSkinId.value).toBe('modern')
    expect(activeSkinId.value).not.toBe('classic')
  })

  it('should setSkin persists to localStorage', async () => {
    const { setSkin } = useSkin()
    await setSkin('modern')
    expect(localStorage.getItem('ecs-ui-skin')).toBe('"modern"')
    expect(localStorage.getItem('ecs-ui-skin')).not.toBeNull()
  })

  it('should setSkin ignores invalid skin id', async () => {
    const { activeSkinId, setSkin } = useSkin()
    const before = activeSkinId.value
    await setSkin('nonexistent')
    expect(activeSkinId.value).toBe(before)
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })

  it('should setSkin ignores current skin id', async () => {
    const { activeSkinId, setSkin } = useSkin()
    const before = activeSkinId.value
    await setSkin(before)
    expect(activeSkinId.value).toBe(before)
    expect(localStorage.getItem('ecs-ui-skin')).toBeNull()
  })
})
