/**
 * @file useSkin.test.ts
 * @description Tests for the useSkin shared composable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSkin } from '@/shared/composables/useSkin.js'
import { DEFAULT_SKIN } from '@/shared/skins/registry.js'

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

  it('returns activeSkinId defaulting to DEFAULT_SKIN', () => {
    const { activeSkinId } = useSkin()
    expect(activeSkinId.value).toBe(DEFAULT_SKIN)
  })

  it('returns skins array with 2 entries', () => {
    const { skins } = useSkin()
    expect(skins.length).toBe(2)
  })

  it('returns switchSkin function', () => {
    const { switchSkin } = useSkin()
    expect(typeof switchSkin).toBe('function')
  })

  it('switchSkin updates activeSkinId', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    await switchSkin('modern')
    expect(activeSkinId.value).toBe('modern')
  })

  it('switchSkin persists to localStorage', async () => {
    const { switchSkin } = useSkin()
    await switchSkin('modern')
    expect(localStorage.getItem('ecs-ui-skin')).toBe('"modern"')
  })

  it('switchSkin ignores invalid skin id', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const before = activeSkinId.value
    await switchSkin('nonexistent')
    expect(activeSkinId.value).toBe(before)
  })

  it('switchSkin ignores current skin id', async () => {
    const { activeSkinId, switchSkin } = useSkin()
    const before = activeSkinId.value
    await switchSkin(before)
    expect(activeSkinId.value).toBe(before)
  })
})
